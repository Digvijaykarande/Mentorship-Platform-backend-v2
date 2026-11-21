import { Router } from "express";
import { ROLES } from "../../config/constants.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import * as c from "./feedback.controller.js";
import {
  feedbackParams,
  giveFeedbackBody,
  listFeedbackQuery,
  requestFeedbackBody,
  respondBody,
  statusBody,
  suggestionParams,
} from "./feedback.schema.js";

const router = Router();
const staff = authorize(ROLES.ADMIN, ROLES.MENTOR);
const intern = authorize(ROLES.INTERN);
const anyone = authorize(ROLES.ADMIN, ROLES.MENTOR, ROLES.INTERN);

router.use(authenticate);

router.get("/", anyone, validate({ query: listFeedbackQuery }), c.list);
router.post("/", staff, validate({ body: giveFeedbackBody }), c.give);
router.post("/request", intern, validate({ body: requestFeedbackBody }), c.request);
router.get("/:id", anyone, validate({ params: feedbackParams }), c.get);
router.post("/:id/respond", staff, validate({ params: feedbackParams, body: respondBody }), c.respond);
router.patch("/:id/status", anyone, validate({ params: feedbackParams, body: statusBody }), c.setStatus);
router.post("/:id/suggestions/:index", intern, validate({ params: suggestionParams }), c.addSuggestion);

export default router;
