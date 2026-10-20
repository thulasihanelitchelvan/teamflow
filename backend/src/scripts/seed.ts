import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Task, type TaskStatus, type TaskPriority, priorityRank } from "../models/Task.js";
import { Activity } from "../models/Activity.js";
import { Comment } from "../models/Comment.js";

const demoPassword = "TeamFlowDemo123!";
const demoUsers = [
  { name: "Morgan Lee", email: "morgan@teamflow.demo" },
  { name: "Avery Chen", email: "avery@teamflow.demo" },
  { name: "Jordan Kim", email: "jordan@teamflow.demo" },
  { name: "Riley Patel", email: "riley@teamflow.demo" },
];
const statusCycle: TaskStatus[] = ["Backlog", "To Do", "In Progress", "Done"];
const priorityCycle: TaskPriority[] = ["Low", "Medium", "High", "Critical"];
const taskTitles = [
  "Map the onboarding journey", "Audit empty states", "Refine dashboard layout", "Review API error patterns",
  "Write component guidelines", "Create launch checklist", "Verify responsive layouts", "Improve task filters",
  "Add keyboard shortcuts", "Document API endpoints", "Review access controls", "Polish project settings",
  "Add activity timeline", "Test task conflict handling", "Prepare sprint retrospective",
];

async function getOrCreateUser(name: string, email: string, passwordHash: string) {
  return User.findOneAndUpdate({ email }, { $set: { name, email, passwordHash } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function ensureProject(name: string, description: string, ownerId: mongoose.Types.ObjectId, memberIds: mongoose.Types.ObjectId[]) {
  const project = await Project.findOneAndUpdate(
    { name, owner: ownerId },
    { $set: { name, description, owner: ownerId, members: memberIds } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const existingCount = await Task.countDocuments({ project: project._id });
  if (existingCount === 0) {
    const docs = taskTitles.map((title, i) => {
      const status = statusCycle[(i + (name === "Website refresh" ? 1 : 0)) % statusCycle.length];
      const priority = priorityCycle[(i * 3 + (name === "Website refresh" ? 1 : 0)) % priorityCycle.length];
      const dueOffset = i % 5 === 0 ? -i - 1 : i % 3 === 0 ? i + 2 : 7 + i;
      const assignee = i % 4 === 0 ? null : (i % 2 === 0 ? memberIds[0] : ownerId);
      return {
        project: project._id,
        title: `${name === "Product launch" ? "Launch" : "Web"}: ${title}`,
        description: `Demo task ${i + 1}. Confirm the acceptance criteria, share progress, and leave a short update for the team.`,
        status, priority, priorityRank: priorityRank(priority), assignee, creator: ownerId,
        dueDate: new Date(Date.now() + dueOffset * 86400000), version: 1,
      };
    });
    const tasks = await Task.insertMany(docs);
    const owner = await User.findById(ownerId);
    const activities = tasks.slice(-8).map((task) => ({ project: project._id, actor: ownerId, actorName: owner?.name || "Demo User", action: "task.created" as const, targetType: "task" as const, targetId: task._id, targetLabel: task.title, newValue: { status: task.status, priority: task.priority } }));
    await Activity.insertMany(activities);
  }
  return project;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI in backend/.env before seeding.");
  await connectDatabase();
  try {
    await Promise.all([User.createIndexes(), Project.createIndexes(), Task.createIndexes(), Activity.createIndexes(), Comment.createIndexes()]);
    const passwordHash = await bcrypt.hash(demoPassword, 12);
    const users = [];
    for (const item of demoUsers) users.push(await getOrCreateUser(item.name, item.email, passwordHash));
    await ensureProject("Product launch", "Coordinate the launch plan, product polish, and go-to-market checklist.", users[0]._id, [users[1]._id, users[2]._id]);
    await ensureProject("Website refresh", "A shared space to improve the website experience from first click to conversion.", users[1]._id, [users[0]._id, users[3]._id]);
    console.log("\nTeamFlow seed completed. Demo credentials:");
    for (const user of demoUsers) console.log(`  ${user.name}: ${user.email} / ${demoPassword}`);
    console.log("\nTwo projects and 30 tasks are available. Existing task sets are left intact on repeat runs.");
  } finally { await mongoose.disconnect(); }
}

void main().catch((error) => { console.error("Seed failed:", error); process.exit(1); });
