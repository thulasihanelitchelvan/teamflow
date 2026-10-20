import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.code === 11000) { res.status(409).json({ success: false, message: "A record with this unique value already exists" }); return; }
  if (err instanceof mongoose.Error.ValidationError) { res.status(400).json({ success: false, message: "Validation failed", errors: Object.values(err.errors).map((item) => item.message) }); return; }
  if (err instanceof mongoose.Error.CastError) { res.status(400).json({ success: false, message: "Invalid identifier or value" }); return; }
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
};
