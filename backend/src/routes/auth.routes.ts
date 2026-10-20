import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
const registerSchema = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(254), password: z.string().min(12).max(128) });
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid registration details", errors: parsed.error.flatten() }); return; }
    const name = parsed.data.name; const email = parsed.data.email.toLowerCase();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    try {
      const user = await User.create({ name, email, passwordHash });
      res.status(201).json({ success: true, user: { id: user._id.toString(), name: user.name, email: user.email } });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) { res.status(409).json({ success: false, message: "Email is already registered" }); return; }
      throw error;
    }
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid email or password" }); return; }
    const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) { res.status(401).json({ success: false, message: "Invalid email or password" }); return; }
    req.session.regenerate((error) => {
      if (error) { next(error); return; }
      req.session.userId = user._id.toString();
      req.session.save((saveError) => {
        if (saveError) { next(saveError); return; }
        res.json({ success: true, user: { id: user._id.toString(), name: user.name, email: user.email } });
      });
    });
  } catch (error) { next(error); }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) { req.session.destroy(() => undefined); res.status(401).json({ success: false, message: "Session is no longer valid" }); return; }
    res.json({ success: true, user: { id: user._id.toString(), name: user.name, email: user.email } });
  } catch (error) { next(error); }
});

router.post("/logout", requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) { next(error); return; }
    res.clearCookie(process.env.SESSION_COOKIE_NAME || "teamflow.sid", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    res.json({ success: true, message: "Logged out successfully" });
  });
});
export default router;
