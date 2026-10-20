import mongoose, { Schema, type Model, type Document } from "mongoose";

export interface IProject extends Document {
  name: string;
  description: string;
  owner: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: "", maxlength: 2000 },
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  members: [{ type: Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

projectSchema.index({ owner: 1, updatedAt: -1 });
projectSchema.index({ members: 1, updatedAt: -1 });

export const Project: Model<IProject> = mongoose.models.Project || mongoose.model<IProject>("Project", projectSchema);
