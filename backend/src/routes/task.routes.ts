import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Task, TASK_PRIORITIES, TASK_STATUSES, priorityRank } from "../models/Task.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { Comment } from "../models/Comment.js";
import { asyncHandler, forbidden, getAccessibleProject, requireObjectId } from "../middleware/projectAccess.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { writeActivity } from "../utils/activity.js";

const router = Router();
router.use(requireAuth);
const createSchema = z.object({
  title: z.string().trim().min(1).max(150), description: z.string().max(5000).optional().default(""),
  status: z.enum(TASK_STATUSES).optional().default("Backlog"), priority: z.enum(TASK_PRIORITIES).optional().default("Medium"),
  assignee: z.string().nullable().optional().default(null), dueDate: z.string().datetime({ offset: true }).nullable().optional().default(null),
});
const patchSchema = z.object({
  version: z.number().int().min(1), title: z.string().trim().min(1).max(150).optional(), description: z.string().max(5000).optional(),
  status: z.enum(TASK_STATUSES).optional(), priority: z.enum(TASK_PRIORITIES).optional(),
  assignee: z.string().nullable().optional(), dueDate: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Provide at least one field to update" });

async function getTaskAccess(taskId: string, userId: string) {
  if (!mongoose.isValidObjectId(taskId)) return { invalid: true as const };
  const task = await Task.findById(taskId);
  if (!task) return { task: null, project: null };
  const project = await getAccessibleProject(task.project.toString(), userId);
  if (!project) return { task: null, project: null };
  return { task, project };
}
function isOwner(project: { owner: mongoose.Types.ObjectId }, userId: string) { return project.owner.toString() === userId; }

// List tasks with combined server-side search, filters, sorting and pagination.
router.get("/projects/:projectId/tasks", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.projectId), res, "project ID")) return;
  const project = await getAccessibleProject(String(req.params.projectId), req.session.userId!);
  if (!project) { res.status(404).json({ success: false, message: "Project not found" }); return; }
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "10"), 10) || 10));
  const filter: Record<string, unknown> = { project: project._id };
  const status = String(req.query.status || "");
  const priority = String(req.query.priority || "");
  const assignee = String(req.query.assignee || "");
  const search = String(req.query.search || "").trim().slice(0, 150);
  const sortBy = String(req.query.sortBy || "createdAt");
  const order = String(req.query.order || "desc").toLowerCase() === "asc" ? 1 : -1;
  if (status && status !== "all") {
    if (!(TASK_STATUSES as readonly string[]).includes(status)) { res.status(400).json({ success: false, message: "Invalid task status" }); return; }
    filter.status = status;
  }
  if (priority && priority !== "all") {
    if (!(TASK_PRIORITIES as readonly string[]).includes(priority)) { res.status(400).json({ success: false, message: "Invalid task priority" }); return; }
    filter.priority = priority;
  }
  if (assignee && assignee !== "all") {
    if (assignee === "me") filter.assignee = req.session.userId;
    else if (assignee === "unassigned") filter.assignee = null;
    else if (mongoose.isValidObjectId(assignee)) filter.assignee = assignee;
    else { res.status(400).json({ success: false, message: "Invalid assignee" }); return; }
  }
  if (String(req.query.overdue) === "true") {
    filter.dueDate = { $lt: new Date(), $ne: null };
    filter.status = { ...(typeof filter.status === "object" ? filter.status as object : filter.status ? { $eq: filter.status } : {}), $ne: "Done" };
  }
  if (search) filter.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const allowedSort = ["createdAt", "dueDate", "priority"];
  if (!allowedSort.includes(sortBy)) { res.status(400).json({ success: false, message: "Invalid sort field" }); return; }
  const sort: Record<string, 1 | -1> = sortBy === "priority" ? { priorityRank: order, createdAt: -1 } : { [sortBy]: order, createdAt: -1 };
  const [total, tasks] = await Promise.all([
    Task.countDocuments(filter),
    Task.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).populate("assignee", "name email").populate("creator", "name email").lean(),
  ]);
  res.json({ success: true, tasks, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.post("/projects/:projectId/tasks", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.projectId), res, "project ID")) return;
  const project = await getAccessibleProject(String(req.params.projectId), req.session.userId!);
  if (!project) { res.status(404).json({ success: false, message: "Project not found" }); return; }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid task details", errors: parsed.error.flatten() }); return; }
  const user = await User.findById(req.session.userId);
  if (!user) { res.status(401).json({ success: false, message: "Session is no longer valid" }); return; }
  if (parsed.data.assignee && !isOwner(project, req.session.userId!)) { forbidden(res, "Only the owner can assign tasks"); return; }
  if (parsed.data.assignee) {
    if (!mongoose.isValidObjectId(parsed.data.assignee)) { res.status(400).json({ success: false, message: "Invalid assignee" }); return; }
    const isMember = project.owner.toString() === parsed.data.assignee || project.members.some((m) => m.toString() === parsed.data.assignee);
    if (!isMember) { res.status(400).json({ success: false, message: "Assignee must be a current project member" }); return; }
  }
  const transaction = await mongoose.startSession();
  let createdTaskId = "";
  try {
    await transaction.withTransaction(async () => {
      const [createdTask] = await Task.create([{
        ...parsed.data,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        project: project._id,
        creator: user._id,
        priorityRank: priorityRank(parsed.data.priority),
      }], { session: transaction });
      createdTaskId = createdTask._id.toString();
      await writeActivity({ projectId: project._id, actorId: user._id, actorName: user.name, action: "task.created", targetType: "task", targetId: createdTask._id, targetLabel: createdTask.title, newValue: { status: createdTask.status, priority: createdTask.priority } }, transaction);
    });
  } finally { await transaction.endSession(); }
  const task = await Task.findById(createdTaskId);
  if (!task) { res.status(500).json({ success: false, message: "Task creation failed" }); return; }
  await task.populate("assignee", "name email"); await task.populate("creator", "name email");
  res.status(201).json({ success: true, task });
}));

router.get("/tasks/:taskId", asyncHandler(async (req, res) => {
  const access = await getTaskAccess(String(req.params.taskId), req.session.userId!);
  if ("invalid" in access && access.invalid) { res.status(400).json({ success: false, message: "Invalid task ID" }); return; }
  if (!access.task || !access.project) { res.status(404).json({ success: false, message: "Task not found" }); return; }
  await access.task.populate("assignee", "name email"); await access.task.populate("creator", "name email");
  const comments = await Comment.find({ task: access.task._id }).sort({ createdAt: 1 }).lean();
  res.json({ success: true, task: access.task, comments });
}));

router.patch("/tasks/:taskId", asyncHandler(async (req, res) => {
  const access = await getTaskAccess(String(req.params.taskId), req.session.userId!);
  if ("invalid" in access && access.invalid) { res.status(400).json({ success: false, message: "Invalid task ID" }); return; }
  if (!access.task || !access.project) { res.status(404).json({ success: false, message: "Task not found" }); return; }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid task update", errors: parsed.error.flatten() }); return; }
  const task = access.task; const project = access.project; const userId = req.session.userId!;
  const owner = isOwner(project, userId); const creator = task.creator.toString() === userId;
  const fields = Object.keys(parsed.data).filter((key) => key !== "version");
  const onlyStatus = fields.length === 1 && fields[0] === "status";
  if (!owner && !creator && !onlyStatus) { forbidden(res, "Members can only edit their own tasks; they may change any task status"); return; }
  if (parsed.data.assignee !== undefined && !owner) { forbidden(res, "Only the owner can assign or reassign tasks"); return; }
  if (parsed.data.assignee) {
    if (!mongoose.isValidObjectId(parsed.data.assignee)) { res.status(400).json({ success: false, message: "Invalid assignee" }); return; }
    const member = project.owner.toString() === parsed.data.assignee || project.members.some((m) => m.toString() === parsed.data.assignee);
    if (!member) { res.status(400).json({ success: false, message: "Assignee must be a current project member" }); return; }
  }
  const currentVersion = task.version;
  if (parsed.data.version !== currentVersion) { res.status(409).json({ success: false, code: "EDIT_CONFLICT", message: "This task changed since you opened it. Reload the latest task and try again.", currentVersion }); return; }
  const updates: Record<string, unknown> = {};
  for (const field of fields) {
    const value = parsed.data[field as keyof typeof parsed.data];
    if (field === "dueDate") updates.dueDate = value ? new Date(value as string) : null;
    else if (field === "priority") { updates.priority = value; updates.priorityRank = priorityRank(value as typeof TASK_PRIORITIES[number]); }
    else updates[field] = value;
  }
  const actor = await User.findById(userId);
  const previousStatus = task.status; const previousAssignee = task.assignee?.toString() || null;
  const newStatus = (updates.status as string | undefined) ?? task.status;
  const newAssignee = Object.prototype.hasOwnProperty.call(updates, "assignee") ? (updates.assignee as string | null) : previousAssignee;
  const [previousAssigneeUser, nextAssigneeUser] = await Promise.all([
    previousAssignee ? User.findById(previousAssignee).select("name") : Promise.resolve(null),
    newAssignee && newAssignee !== previousAssignee ? User.findById(newAssignee).select("name") : Promise.resolve(null),
  ]);
  const session = await mongoose.startSession();
  let updated: typeof task | null = null;
  try {
    await session.withTransaction(async () => {
      updated = await Task.findOneAndUpdate(
        { _id: task._id, project: project._id, version: currentVersion },
        { $set: updates, $inc: { version: 1 } },
        { new: true, runValidators: true, session }
      );
      if (!updated) throw Object.assign(new Error("EDIT_CONFLICT"), { code: "EDIT_CONFLICT" });
      if (newStatus !== previousStatus) await writeActivity({ projectId: project._id, actorId: userId, actorName: actor?.name || "Team member", action: "task.status_changed", targetType: "task", targetId: task._id, targetLabel: task.title, previousValue: previousStatus, newValue: newStatus }, session);
      if (newAssignee !== previousAssignee) await writeActivity({ projectId: project._id, actorId: userId, actorName: actor?.name || "Team member", action: "task.assignee_changed", targetType: "task", targetId: task._id, targetLabel: task.title, previousValue: previousAssignee ? { id: previousAssignee, name: previousAssigneeUser?.name || "Member" } : null, newValue: newAssignee ? { id: newAssignee, name: nextAssigneeUser?.name || previousAssigneeUser?.name || "Member" } : null }, session);
    });
  } catch (error) {
    if ((error as { code?: string }).code === "EDIT_CONFLICT" || (error as Error).message === "EDIT_CONFLICT") {
      res.status(409).json({ success: false, code: "EDIT_CONFLICT", message: "This task changed since you opened it. Reload the latest task and try again." }); return;
    }
    throw error;
  } finally { await session.endSession(); }
  await updated!.populate("assignee", "name email"); await updated!.populate("creator", "name email");
  res.json({ success: true, task: updated });
}));

router.delete("/tasks/:taskId", asyncHandler(async (req, res) => {
  const access = await getTaskAccess(String(req.params.taskId), req.session.userId!);
  if ("invalid" in access && access.invalid) { res.status(400).json({ success: false, message: "Invalid task ID" }); return; }
  if (!access.task || !access.project) { res.status(404).json({ success: false, message: "Task not found" }); return; }
  const task = access.task; const project = access.project; const userId = req.session.userId!;
  if (!isOwner(project, userId) && task.creator.toString() !== userId) { forbidden(res, "You can only delete tasks you created"); return; }
  const actor = await User.findById(userId);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await writeActivity({ projectId: project._id, actorId: userId, actorName: actor?.name || "Team member", action: "task.deleted", targetType: "task", targetId: task._id, targetLabel: task.title, previousValue: { title: task.title, status: task.status, priority: task.priority } }, session);
      await Task.deleteOne({ _id: task._id }, { session });
      await Comment.deleteMany({ task: task._id }, { session });
    });
  } finally { await session.endSession(); }
  res.json({ success: true, message: "Task deleted" });
}));

router.get("/tasks/:taskId/comments", asyncHandler(async (req, res) => {
  const access = await getTaskAccess(String(req.params.taskId), req.session.userId!);
  if ("invalid" in access && access.invalid) { res.status(400).json({ success: false, message: "Invalid task ID" }); return; }
  if (!access.task || !access.project) { res.status(404).json({ success: false, message: "Task not found" }); return; }
  const comments = await Comment.find({ task: access.task._id }).sort({ createdAt: 1 }).lean();
  res.json({ success: true, comments });
}));

router.post("/tasks/:taskId/comments", asyncHandler(async (req, res) => {
  const access = await getTaskAccess(String(req.params.taskId), req.session.userId!);
  if ("invalid" in access && access.invalid) { res.status(400).json({ success: false, message: "Invalid task ID" }); return; }
  if (!access.task || !access.project) { res.status(404).json({ success: false, message: "Task not found" }); return; }
  const parsed = z.object({ body: z.string().trim().min(1).max(3000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, message: "Comment must contain 1–3000 characters" }); return; }
  const user = await User.findById(req.session.userId);
  if (!user) { res.status(401).json({ success: false, message: "Session is no longer valid" }); return; }
  const comment = await Comment.create({ project: access.project._id, task: access.task._id, author: user._id, authorName: user.name, body: parsed.data.body });
  res.status(201).json({ success: true, comment });
}));

export const commentRouter = Router();
commentRouter.use(requireAuth);
commentRouter.delete("/:commentId", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.commentId), res, "comment ID")) return;
  const comment = await Comment.findById(String(req.params.commentId));
  if (!comment) { res.status(404).json({ success: false, message: "Comment not found" }); return; }
  const project = await getAccessibleProject(comment.project.toString(), req.session.userId!);
  if (!project) { res.status(404).json({ success: false, message: "Comment not found" }); return; }
  if (comment.author.toString() !== req.session.userId && project.owner.toString() !== req.session.userId) { forbidden(res, "You can delete only your own comments"); return; }
  await comment.deleteOne();
  res.json({ success: true, message: "Comment deleted" });
}));

export default router;
