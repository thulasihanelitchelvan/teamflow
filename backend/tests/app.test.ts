import mongoose from "mongoose";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { Project } from "../src/models/Project.js";
import { Task } from "../src/models/Task.js";
import { Comment } from "../src/models/Comment.js";
import { Activity } from "../src/models/Activity.js";

type Agent = ReturnType<typeof request.agent>;
const password = "TestPassword123!";
let sequence = 0;
async function createUser(name = "Test Owner"): Promise<{ agent: Agent; user: { id: string; email: string; name: string } }> {
  sequence += 1;
  const email = `user${sequence}@example.test`;
  const agent = request.agent(app);
  const registered = await agent.post("/api/auth/register").send({ name, email, password }).expect(201);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return { agent, user: registered.body.user };
}
async function createProject(agent: Agent, name = "Test Project") {
  const response = await agent.post("/api/projects").send({ name, description: "Project description" }).expect(201);
  return response.body.project as { _id: string; name: string };
}
async function createTask(agent: Agent, projectId: string, fields: Record<string, unknown> = {}) {
  const response = await agent.post(`/api/projects/${projectId}/tasks`).send({ title: "Alpha test task", ...fields }).expect(201);
  return response.body.task as { _id: string; version: number; title: string; status: string; assignee: string | null };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_TEST_URI!, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([User.syncIndexes(), Project.syncIndexes(), Task.syncIndexes(), Comment.syncIndexes(), Activity.syncIndexes()]);
});
beforeEach(async () => {
  sequence = 0;
  await Promise.all([User.deleteMany({}), Project.deleteMany({}), Task.deleteMany({}), Comment.deleteMany({}), Activity.deleteMany({}), mongoose.connection.collection("sessions").deleteMany({})]);
});
afterAll(async () => { await mongoose.disconnect(); });

describe("TeamFlow API integration", () => {
  it("registers, logs in, returns current user, and rejects the session after logout", async () => {
    const agent = request.agent(app); const email = "auth@example.test";
    await agent.post("/api/auth/register").send({ name: "Auth User", email, password }).expect(201);
    const stored = await User.findOne({ email }).select("+passwordHash");
    expect(stored?.passwordHash).not.toBe(password);
    await agent.get("/api/auth/me").expect(401);
    await agent.post("/api/auth/login").send({ email, password }).expect(200);
    await agent.get("/api/auth/me").expect(200);
    await agent.post("/api/auth/logout").expect(200);
    await agent.get("/api/auth/me").expect(401);
  });

  it("prevents non-members from accessing another team's project data", async () => {
    const owner = await createUser("Owner"); const outsider = await createUser("Outsider");
    const project = await createProject(owner.agent);
    await outsider.agent.get(`/api/projects/${project._id}`).expect(404);
    await outsider.agent.get(`/api/projects/${project._id}/tasks`).expect(404);
    expect((await outsider.agent.get("/api/projects").expect(200)).body.projects).toHaveLength(0);
  });

  it("enforces owner/member task permissions while allowing members to change any status", async () => {
    const owner = await createUser("Owner"); const member = await createUser("Member");
    const project = await createProject(owner.agent);
    await owner.agent.post(`/api/projects/${project._id}/members`).send({ email: member.user.email }).expect(201);
    const ownersTask = await createTask(owner.agent, project._id);
    await member.agent.patch(`/api/tasks/${ownersTask._id}`).send({ version: ownersTask.version, title: "Unauthorized edit" }).expect(403);
    await member.agent.patch(`/api/tasks/${ownersTask._id}`).send({ version: ownersTask.version, status: "In Progress" }).expect(200);
    await member.agent.delete(`/api/tasks/${ownersTask._id}`).expect(403);
    const membersTask = await createTask(member.agent, project._id, { title: "Member-owned task" });
    await member.agent.patch(`/api/tasks/${membersTask._id}`).send({ version: membersTask.version, title: "Updated my task" }).expect(200);
    await owner.agent.patch(`/api/tasks/${membersTask._id}`).send({ version: 2, assignee: owner.user.id }).expect(200);
  });

  it("validates task statuses and rejects assignments outside project membership", async () => {
    const owner = await createUser("Owner"); const outsider = await createUser("Outsider");
    const project = await createProject(owner.agent);
    await owner.agent.post(`/api/projects/${project._id}/tasks`).send({ title: "Invalid status", status: "Shipping" }).expect(400);
    await owner.agent.post(`/api/projects/${project._id}/tasks`).send({ title: "Bad assignment", assignee: outsider.user.id }).expect(400);
    await owner.agent.post(`/api/projects/${project._id}/tasks`).send({ title: "x".repeat(151) }).expect(400);
  });

  it("combines server-side search, status, priority, sorting and pagination", async () => {
    const owner = await createUser(); const project = await createProject(owner.agent);
    await createTask(owner.agent, project._id, { title: "Alpha high active", status: "In Progress", priority: "High" });
    await createTask(owner.agent, project._id, { title: "Alpha critical active", status: "In Progress", priority: "Critical" });
    await createTask(owner.agent, project._id, { title: "Alpha low active", status: "In Progress", priority: "Low" });
    await createTask(owner.agent, project._id, { title: "Beta high active", status: "In Progress", priority: "High" });
    const result = await owner.agent.get(`/api/projects/${project._id}/tasks?search=Alpha&status=In%20Progress&sortBy=priority&order=desc&page=1&limit=1`).expect(200);
    expect(result.body.pagination.total).toBe(3);
    expect(result.body.tasks).toHaveLength(1);
    expect(result.body.tasks[0].title).toBe("Alpha critical active");
    expect(result.body.pagination.page).toBe(1);
    const filtered = await owner.agent.get(`/api/projects/${project._id}/tasks?search=Alpha&priority=High&limit=10`).expect(200);
    expect(filtered.body.pagination.total).toBe(1);
    expect(filtered.body.tasks[0].title).toBe("Alpha high active");
  });

  it("rejects stale edits and records activity only for successful changes", async () => {
    const owner = await createUser(); const project = await createProject(owner.agent); const task = await createTask(owner.agent, project._id);
    await owner.agent.patch(`/api/tasks/${task._id}`).send({ version: task.version, status: "In Progress" }).expect(200);
    const conflict = await owner.agent.patch(`/api/tasks/${task._id}`).send({ version: task.version, status: "Done" }).expect(409);
    expect(conflict.body.code).toBe("EDIT_CONFLICT");
    const activity = (await owner.agent.get(`/api/projects/${project._id}/activity`).expect(200)).body.activity;
    expect(activity.filter((x: { action: string }) => x.action === "task.status_changed")).toHaveLength(1);
  });

  it("clears removed member assignments, revokes access and retains comments/history", async () => {
    const owner = await createUser("Owner"); const member = await createUser("Member"); const project = await createProject(owner.agent);
    await owner.agent.post(`/api/projects/${project._id}/members`).send({ email: member.user.email }).expect(201);
    const task = await createTask(owner.agent, project._id, { assignee: member.user.id });
    await member.agent.post(`/api/tasks/${task._id}/comments`).send({ body: "Keeping this note after access changes." }).expect(201);
    await owner.agent.delete(`/api/projects/${project._id}/members/${member.user.id}`).expect(200);
    await member.agent.get(`/api/projects/${project._id}`).expect(404);
    const detail = await owner.agent.get(`/api/tasks/${task._id}`).expect(200);
    expect(detail.body.task.assignee).toBeNull();
    expect(detail.body.comments).toHaveLength(1);
    const activity = (await owner.agent.get(`/api/projects/${project._id}/activity`).expect(200)).body.activity;
    expect(activity.some((x: { action: string }) => x.action === "member.removed")).toBe(true);
  });
});
