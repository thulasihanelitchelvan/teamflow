import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Project, type IProject } from "../models/Project.js";

export function hasProjectAccess(project: IProject, userId: string): boolean {
  if (project.owner.toString() === userId) return true;
  return project.members.some((member) => member.toString() === userId);
}

export async function getAccessibleProject(projectId: string, userId: string): Promise<IProject | null> {
  if (!mongoose.isValidObjectId(projectId)) return null;
  const project = await Project.findById(projectId);
  return project && hasProjectAccess(project, userId) ? project : null;
}

export function requireObjectId(value: string, res: Response, field = "id"): boolean {
  if (!mongoose.isValidObjectId(value)) {
    res.status(400).json({ success: false, message: `Invalid ${field}` });
    return false;
  }
  return true;
}

export function forbidden(res: Response, message = "You do not have permission to perform this action"): void {
  res.status(403).json({ success: false, message });
}

export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}
