import mongoose from "mongoose";
import { Activity, type ActivityAction } from "../models/Activity.js";

export async function writeActivity(input: {
  projectId: string | mongoose.Types.ObjectId;
  actorId: string | mongoose.Types.ObjectId;
  actorName: string;
  action: ActivityAction;
  targetType: "task" | "member" | "project";
  targetId?: string | mongoose.Types.ObjectId;
  targetLabel: string;
  previousValue?: unknown;
  newValue?: unknown;
}, session?: mongoose.ClientSession) {
  const [record] = await Activity.create([{
    project: input.projectId,
    actor: input.actorId,
    actorName: input.actorName,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    previousValue: input.previousValue,
    newValue: input.newValue,
  }], session ? { session } : undefined);
  return record;
}
