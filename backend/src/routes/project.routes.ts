import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { Task, TASK_STATUSES } from "../models/Task.js";
import { Activity } from "../models/Activity.js";
import { Comment } from "../models/Comment.js";
import { asyncHandler, forbidden, getAccessibleProject, requireObjectId } from "../middleware/projectAccess.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { writeActivity } from "../utils/activity.js";

const router = Router();
router.use(requireAuth);
const projectInput = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(2000).optional().default("") });

router.get("/", asyncHandler(async (req, res) => {
  const userId = req.session.userId!;
  const projects = await Project.find({ $or: [{ owner: userId }, { members: userId }] })
    .sort({ updatedAt: -1 }).populate("owner", "name email").populate("members", "name email");
  res.json({ success: true, projects });
}));

router.post("/", asyncHandler(async (req, res) => {
  const parsed = projectInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid project details", errors: parsed.error.flatten() }); return; }
  const user = await User.findById(req.session.userId);
  if (!user) { res.status(401).json({ success: false, message: "Session is no longer valid" }); return; }
  const transaction = await mongoose.startSession();
  let createdProjectId = "";
  try {
    await transaction.withTransaction(async () => {
      const [createdProject] = await Project.create([{ ...parsed.data, owner: user._id, members: [] }], { session: transaction });
      createdProjectId = createdProject._id.toString();
      await writeActivity({ projectId: createdProject._id, actorId: user._id, actorName: user.name, action: "project.created", targetType: "project", targetId: createdProject._id, targetLabel: createdProject.name }, transaction);
    });
  } finally { await transaction.endSession(); }
  const project = await Project.findById(createdProjectId);
  if (!project) { res.status(500).json({ success: false, message: "Project creation failed" }); return; }
  res.status(201).json({ success: true, project });
}));

router.get("/:projectId", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.projectId), res, "project ID")) return;
  const project = await getAccessibleProject(String(req.params.projectId), req.session.userId!);
  if (!project) { res.status(404).json({ success: false, message: "Project not found" }); return; }
  await project.populate("owner", "name email");
  await project.populate("members", "name email");
  res.json({ success: true, project });
}));

router.patch("/:projectId", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.projectId), res, "project ID")) return;
  const project = await Project.findById(String(req.params.projectId));
  if (!project) { res.status(404).json({ success: false, message: "Project not found" }); return; }
  if (project.owner.toString() !== req.session.userId) { forbidden(res); return; }
  const parsed = projectInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid project details", errors: parsed.error.flatten() }); return; }
  project.name = parsed.data.name; project.description = parsed.data.description;
  await project.save();
  res.json({ success: true, project });
}));

router.post("/:projectId/members", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.projectId), res, "project ID")) return;
  const schema = z.object({ email: z.string().trim().email().max(254) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, message: "A valid member email is required" }); return; }
  const project = await Project.findById(String(req.params.projectId));
  if (!project) { res.status(404).json({ success: false, message: "Project not found" }); return; }
  if (project.owner.toString() !== req.session.userId) { forbidden(res, "Only the project owner can manage members"); return; }
  const member = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!member) { res.status(404).json({ success: false, message: "No registered user found with that email" }); return; }
  const memberId = member._id.toString();
  if (project.owner.toString() === memberId) { res.status(409).json({ success: false, message: "The owner is already part of the project" }); return; }
  if (project.members.some((id) => id.toString() === memberId)) { res.status(409).json({ success: false, message: "User is already a project member" }); return; }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      project.members.push(member._id);
      await project.save({ session });
      const actor = await User.findById(req.session.userId).session(session);
      await writeActivity({ projectId: project._id, actorId: req.session.userId!, actorName: actor?.name || "Team member", action: "member.added", targetType: "member", targetId: member._id, targetLabel: member.name, newValue: { email: member.email } }, session);
    });
  } finally { await session.endSession(); }
  await project.populate("owner", "name email"); await project.populate("members", "name email");
  res.status(201).json({ success: true, project });
}));

router.delete("/:projectId/members/:userId", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.projectId), res, "project ID") || !requireObjectId(String(req.params.userId), res, "user ID")) return;
  const project = await Project.findById(String(req.params.projectId));
  if (!project) { res.status(404).json({ success: false, message: "Project not found" }); return; }
  if (project.owner.toString() !== req.session.userId) { forbidden(res, "Only the project owner can manage members"); return; }
  if (project.owner.toString() === String(req.params.userId)) { res.status(400).json({ success: false, message: "The project owner cannot be removed" }); return; }
  const wasMember = project.members.some((id) => id.toString() === String(req.params.userId));
  if (!wasMember) { res.status(404).json({ success: false, message: "Project member not found" }); return; }
  const member = await User.findById(String(req.params.userId));
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const assignedTasks = await Task.find({ project: project._id, assignee: String(req.params.userId) }).session(session).select("title");
      project.members = project.members.filter((id) => id.toString() !== String(req.params.userId));
      await project.save({ session });
      await Task.updateMany({ project: project._id, assignee: String(req.params.userId) }, { $set: { assignee: null }, $inc: { version: 1 } }, { session });
      const actor = await User.findById(req.session.userId).session(session);
      for (const assignedTask of assignedTasks) {
        await writeActivity({ projectId: project._id, actorId: req.session.userId!, actorName: actor?.name || "Team member", action: "task.assignee_changed", targetType: "task", targetId: assignedTask._id, targetLabel: assignedTask.title, previousValue: { id: String(req.params.userId), name: member?.name || "Former member" }, newValue: null }, session);
      }
      await writeActivity({ projectId: project._id, actorId: req.session.userId!, actorName: actor?.name || "Team member", action: "member.removed", targetType: "member", targetId: String(req.params.userId), targetLabel: member?.name || "Former member", previousValue: { email: member?.email || "" }, newValue: null }, session);
    });
  } finally { await session.endSession(); }
  res.json({ success: true, message: "Member removed; assignments cleared and access revoked" });
}));

router.get("/:projectId/activity", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.projectId), res, "project ID")) return;
  const project = await getAccessibleProject(String(req.params.projectId), req.session.userId!);
  if (!project) { res.status(404).json({ success: false, message: "Project not found" }); return; }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const activity = await Activity.find({ project: project._id }).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ success: true, activity });
}));

router.get("/:projectId/dashboard", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.projectId), res, "project ID")) return;
  const project = await getAccessibleProject(String(req.params.projectId), req.session.userId!);
  if (!project) { res.status(404).json({ success: false, message: "Project not found" }); return; }
  const projectId = project._id;
  const now = new Date();
  const [total, overdue, assignedToMe, byStatus, activity] = await Promise.all([
    Task.countDocuments({ project: projectId }),
    Task.countDocuments({ project: projectId, status: { $ne: "Done" }, dueDate: { $lt: now, $ne: null } }),
    Task.countDocuments({ project: projectId, assignee: req.session.userId }),
    Task.aggregate([{ $match: { project: projectId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Activity.find({ project: projectId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  const statusCounts = Object.fromEntries(TASK_STATUSES.map((status) => [status, byStatus.find((s) => s._id === status)?.count || 0]));
  res.json({ success: true, dashboard: { total, overdue, assignedToMe, byStatus: statusCounts, activity } });
}));

router.get("/:projectId/comments", asyncHandler(async (req, res) => {
  if (!requireObjectId(String(req.params.projectId), res, "project ID")) return;
  const project = await getAccessibleProject(String(req.params.projectId), req.session.userId!);
  if (!project) { res.status(404).json({ success: false, message: "Project not found" }); return; }
  const comments = await Comment.find({ project: project._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, comments });
}));

export default router;
