import mongoose, { Schema, type Model, type Document } from "mongoose";
export interface IUser extends Document { name: string; email: string; passwordHash: string; createdAt: Date; updatedAt: Date; }
const userSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true });
userSchema.index({ email: 1 }, { unique: true });
export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
