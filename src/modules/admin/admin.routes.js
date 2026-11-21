import { Router } from "express";
import { ROLES } from "../../config/constants.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { ok } from "../../utils/apiResponse.js";
import * as service from "./admin.service.js";

const router = Router();
router.use(authenticate, authorize(ROLES.ADMIN, ROLES.MENTOR));

router.get("/overview", async (req, res) => ok(res, await service.overview(req.user)));

export default router;
