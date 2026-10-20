import mongoose from "mongoose";
export async function connectDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not defined");
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000, autoIndex: process.env.NODE_ENV !== "production" });
  console.log("MongoDB connected successfully");
}
