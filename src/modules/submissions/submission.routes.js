import { Router } from "express";
import { ROLES } from "../../config/constants.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import * as c from "./submission.controller.js";
import {
  createSubmissionBody,
  editSubmissionBody,
  listSubmissionsQuery,
  reviewSubmissionBody,
  reviseSubmissionBody,
  submissionParams,
} from "./submission.schema.js";

const router = Router();
const intern = authorize(ROLES.INTERN);
const staff = authorize(ROLES.ADMIN, ROLES.MENTOR);
const anyone = authorize(ROLES.ADMIN, ROLES.MENTOR, ROLES.INTERN);
const params = validate({ params: submissionParams });

router.use(authenticate);

router.get("/", anyone, validate({ query: listSubmissionsQuery }), c.list);
router.post("/", intern, validate({ body: createSubmissionBody }), c.create);
router.get("/:id", anyone, params, c.get);
router.put("/:id", intern, validate({ params: submissionParams, body: editSubmissionBody }), c.edit);
router.post("/:id/revisions", intern, validate({ params: submissionParams, body: reviseSubmissionBody }), c.revise);
router.post("/:id/withdraw", intern, params, c.withdraw);
router.post("/:id/restore", intern, params, c.restore);
router.delete("/:id", intern, params, c.remove);
router.post("/:id/review", staff, validate({ params: submissionParams, body: reviewSubmissionBody }), c.review);

export default router;
