import { Router } from "express";
import { validate } from "../../middlewares/validate.js";
import { authenticate } from "../../middlewares/auth.js";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { updateProfileBody, updateSettingsBody } from "../users/user.schema.js";
import { changePasswordBody, loginBody, registerBody } from "./auth.schema.js";
import * as controller from "./auth.controller.js";

const router = Router();

// Public
router.post("/register", authLimiter, validate({ body: registerBody }), controller.register);
router.post("/login", authLimiter, validate({ body: loginBody }), controller.login);
router.post("/refresh", authLimiter, controller.refresh);
router.post("/logout", controller.logout);

// Authenticated
router.get("/me", authenticate, controller.me);
router.put(
  "/profile",
  authenticate,
  validate({ body: updateProfileBody }),
  controller.updateProfile,
);
router.patch(
  "/settings",
  authenticate,
  validate({ body: updateSettingsBody }),
  controller.updateSettings,
);
router.put(
  "/password",
  authenticate,
  authLimiter,
  validate({ body: changePasswordBody }),
  controller.changePassword,
);
router.post("/logout-all", authenticate, controller.logoutAll);
router.delete("/account", authenticate, controller.deleteAccount);

export default router;
