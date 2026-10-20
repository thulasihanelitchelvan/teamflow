import mongoose, { Schema, type Model, type Document } from "mongoose";

export const TASK_STATUSES = ["Backlog", "To Do", "In Progress", "Done"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export type TaskPriority = typeof TASK_PRIORITIES[number];

export interface ITask extends Document {
  project: mongoose.Types.ObjectId;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  priorityRank: number;
  assignee: mongoose.Types.ObjectId | null;
  creator: mongoose.Types.ObjectId;
  version: number;
  dueDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>({
  project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, default: "", maxlength: 5000 },
  status: { type: String, enum: TASK_STATUSES, default: "Backlog", required: true },
  priority: { type: String, enum: TASK_PRIORITIES, default: "Medium", required: true },
  priorityRank: { type: Number, default: 2, index: true },
  assignee: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  creator: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  version: { type: Number, default: 1, min: 1 },
  dueDate: { type: Date, default: null },
}, { timestamps: true });

taskSchema.index({ project: 1, status: 1, createdAt: -1 });
taskSchema.index({ project: 1, priority: 1, dueDate: 1 });
taskSchema.index({ project: 1, priorityRank: -1, createdAt: -1 });
taskSchema.index({ project: 1, status: 1, dueDate: 1 });
taskSchema.index({ project: 1, assignee: 1, status: 1 });
taskSchema.index({ project: 1, title: "text" });

export const priorityRank = (priority: TaskPriority): number => ({ Low: 1, Medium: 2, High: 3, Critical: 4 })[priority];
export const Task: Model<ITask> = mongoose.models.Task || mongoose.model<ITask>("Task", taskSchema);
