import { Router } from "express";
import { ROLES } from "../../config/constants.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import * as c from "./task.controller.js";
import {
  createTaskBody,
  listTasksQuery,
  requestChangesBody,
  reviewNoteBody,
  stepBody,
  stepParams,
  taskParams,
  updateTaskBody,
} from "./task.schema.js";

const router = Router();
const staff = authorize(ROLES.ADMIN, ROLES.MENTOR);
const anyone = authorize(ROLES.ADMIN, ROLES.MENTOR, ROLES.INTERN);

router.use(authenticate);

router.get("/", anyone, validate({ query: listTasksQuery }), c.list);
router.post("/", staff, validate({ body: createTaskBody }), c.create);
router.get("/:id", anyone, validate({ params: taskParams }), c.get);
router.patch("/:id", staff, validate({ params: taskParams, body: updateTaskBody }), c.update);
router.delete("/:id", staff, validate({ params: taskParams }), c.remove);

router.post("/:id/steps", staff, validate({ params: taskParams, body: stepBody }), c.addStep);
router.patch("/:id/steps/:stepId", staff, validate({ params: stepParams, body: stepBody }), c.updateStep);
router.delete("/:id/steps/:stepId", staff, validate({ params: stepParams }), c.removeStep);
router.post(
  "/:id/steps/:stepId/complete",
  authorize(ROLES.INTERN),
  validate({ params: stepParams }),
  c.completeStep,
);
router.post(
  "/:id/steps/:stepId/approve",
  staff,
  validate({ params: stepParams, body: reviewNoteBody }),
  c.approveStep,
);
router.post(
  "/:id/steps/:stepId/request-changes",
  staff,
  validate({ params: stepParams, body: requestChangesBody }),
  c.requestChanges,
);

export default router;
