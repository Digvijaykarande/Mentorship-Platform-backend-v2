import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { idParams } from "../../utils/objectId.js";
import * as c from "./notification.controller.js";

const router = Router();
router.use(authenticate);

router.get("/", c.list);
router.post("/mark-all-read", c.markAllRead);
router.delete("/clear-all", c.clearAll);
router.patch("/:id/toggle-read", validate({ params: idParams }), c.toggleRead);
router.delete("/:id", validate({ params: idParams }), c.remove);

export default router;
