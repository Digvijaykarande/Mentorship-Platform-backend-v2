import { Router } from "express";
import { dbStatus, isDbConnected } from "../config/db.js";
import authRoutes from "../modules/auth/auth.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import projectRoutes from "../modules/projects/project.routes.js";
import taskRoutes from "../modules/tasks/task.routes.js";
import submissionRoutes from "../modules/submissions/submission.routes.js";
import feedbackRoutes from "../modules/feedback/feedback.routes.js";
import notificationRoutes from "../modules/notifications/notification.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import uploadRoutes from "../modules/uploads/upload.routes.js";
import storageRoutes from "../modules/storage/storage.routes.js";

const router = Router();

// Liveness: the process is up.
router.get("/health", (_req, res) =>
  res.json({
    success: true,
    data: {
      status: "ok",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  }),
);

// Readiness: the process can serve traffic (database reachable).
router.get("/health/ready", (_req, res) => {
  const ready = isDbConnected();
  res.status(ready ? 200 : 503).json({
    success: ready,
    data: { status: ready ? "ready" : "unavailable", database: dbStatus() },
  });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/projects", projectRoutes);
router.use("/tasks", taskRoutes);
router.use("/submissions", submissionRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/notifications", notificationRoutes);
router.use("/admin", adminRoutes);
router.use("/uploads", uploadRoutes);
router.use("/storage", storageRoutes);

export default router;
