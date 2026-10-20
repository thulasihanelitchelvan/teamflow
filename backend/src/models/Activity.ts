import mongoose, { Schema, type Model, type Document } from "mongoose";

export type ActivityAction = "task.created" | "task.deleted" | "task.status_changed" | "task.assignee_changed" | "member.added" | "member.removed" | "project.created";
export interface IActivity extends Document {
  project: mongoose.Types.ObjectId;
  actor: mongoose.Types.ObjectId;
  actorName: string;
  action: ActivityAction;
  targetType: "task" | "member" | "project";
  targetId?: mongoose.Types.ObjectId;
  targetLabel: string;
  previousValue?: unknown;
  newValue?: unknown;
  createdAt: Date;
}

const activitySchema = new Schema<IActivity>({
  project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
  actorName: { type: String, required: true },
  action: { type: String, required: true, enum: ["task.created", "task.deleted", "task.status_changed", "task.assignee_changed", "member.added", "member.removed", "project.created"] },
  targetType: { type: String, required: true, enum: ["task", "member", "project"] },
  targetId: { type: Schema.Types.ObjectId },
  targetLabel: { type: String, required: true },
  previousValue: { type: Schema.Types.Mixed },
  newValue: { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false } });

activitySchema.index({ project: 1, createdAt: -1 });
export const Activity: Model<IActivity> = mongoose.models.Activity || mongoose.model<IActivity>("Activity", activitySchema);
