import { Router } from "express";
import { ROLES } from "../../config/constants.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import * as c from "./project.controller.js";
import {
  createProjectBody,
  documentationBody,
  documentationParams,
  listProjectsQuery,
  meetingBody,
  projectParams,
  requestReviewBody,
  resourceBody,
  resourceParams,
  updateProjectBody,
} from "./project.schema.js";

const router = Router();
const staff = authorize(ROLES.ADMIN, ROLES.MENTOR);
const intern = authorize(ROLES.INTERN);
const anyone = authorize(ROLES.ADMIN, ROLES.MENTOR, ROLES.INTERN);

router.use(authenticate);

router.get("/", anyone, validate({ query: listProjectsQuery }), c.list);
router.post("/", staff, validate({ body: createProjectBody }), c.create);
router.get("/:id", anyone, validate({ params: projectParams }), c.get);
router.patch("/:id", staff, validate({ params: projectParams, body: updateProjectBody }), c.update);
router.delete("/:id", staff, validate({ params: projectParams }), c.remove);

router.post("/:id/request-review", intern, validate({ params: projectParams, body: requestReviewBody }), c.requestReview);
router.post("/:id/meetings", intern, validate({ params: projectParams, body: meetingBody }), c.scheduleMeeting);
router.post("/:id/documentation", staff, validate({ params: projectParams, body: documentationBody }), c.addDocumentation);
router.delete("/:id/documentation/:key", staff, validate({ params: documentationParams }), c.removeDocumentation);
router.post("/:id/resources", anyone, validate({ params: projectParams, body: resourceBody }), c.addResource);
router.delete("/:id/resources/:resourceId", anyone, validate({ params: resourceParams }), c.removeResource);

export default router;
