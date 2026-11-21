import { Router } from "express";
import { ROLES } from "../../config/constants.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { idParams } from "../../utils/objectId.js";
import * as c from "./user.admin.controller.js";
import { createUserBody, listUsersQuery, resetPasswordBody, updateUserBody } from "./user.admin.schema.js";

const router = Router();
const admin = authorize(ROLES.ADMIN);
const staff = authorize(ROLES.ADMIN, ROLES.MENTOR);

router.use(authenticate);

// Static paths first so "mentors" is never read as an :id.
router.get("/mentors", c.mentorOptions);
router.get("/", staff, validate({ query: listUsersQuery }), c.list);
router.post("/", admin, validate({ body: createUserBody }), c.create);
router.patch("/:id", admin, validate({ params: idParams, body: updateUserBody }), c.update);
router.post("/:id/approve", admin, validate({ params: idParams }), c.approve);
router.post("/:id/reset-password", admin, validate({ params: idParams, body: resetPasswordBody }), c.resetPassword);
router.delete("/:id", admin, validate({ params: idParams }), c.deactivate);

export default router;
