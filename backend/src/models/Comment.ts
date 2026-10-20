import mongoose, { Schema, type Model, type Document } from "mongoose";

export interface IComment extends Document {
  project: mongoose.Types.ObjectId;
  task: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  authorName: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>({
  project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  task: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  authorName: { type: String, required: true },
  body: { type: String, required: true, trim: true, maxlength: 3000 },
}, { timestamps: true });

commentSchema.index({ task: 1, createdAt: 1 });
export const Comment: Model<IComment> = mongoose.models.Comment || mongoose.model<IComment>("Comment", commentSchema);
