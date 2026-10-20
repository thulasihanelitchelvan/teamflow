import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import session from "express-session";
import MongoStore from "connect-mongo";
import { rateLimit } from "express-rate-limit";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import taskRoutes, { commentRouter } from "./routes/task.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(session({
  name: process.env.SESSION_COOKIE_NAME || "teamflow.sid",
  secret: process.env.SESSION_SECRET || "development-only-secret-change-before-use",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/teamflow", collectionName: "sessions", ttl: 60 * 60 * 24 }),
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 1000 * 60 * 60 * 24, path: "/" },
}));

// Reject browser-originated state changes from an unexpected origin.
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    const expectedOrigin = process.env.CLIENT_URL || "http://localhost:3000";
    if (origin && origin !== expectedOrigin) {
      res.status(403).json({ success: false, message: "Request origin is not allowed" });
      return;
    }
  }
  next();
});

app.get("/api/health", (_req, res) => res.json({ success: true, message: "TeamFlow API is running", timestamp: new Date().toISOString() }));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === "test" ? 1000 : 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many login attempts. Please try again later." } });
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api", taskRoutes);
app.use("/api/comments", commentRouter);
app.use((_req, res) => res.status(404).json({ success: false, message: "Endpoint not found" }));
app.use(errorHandler);
export default app;
