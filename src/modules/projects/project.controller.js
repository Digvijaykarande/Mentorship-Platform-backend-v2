import { created, noContent, ok, pageMeta } from "../../utils/apiResponse.js";
import * as service from "./project.service.js";

export const list = async (req, res) => {
  const query = req.validated.query;
  const { items, total } = await service.list(req.user, query);
  return ok(res, items, { meta: pageMeta({ page: query.page, limit: query.limit, total }) });
};
export const get = async (req, res) => ok(res, await service.getById(req.user, req.params.id));
export const create = async (req, res) =>
  created(res, await service.create(req.user, req.body), { message: "Project created" });
export const update = async (req, res) =>
  ok(res, await service.update(req.user, req.params.id, req.body), { message: "Project updated" });
export const remove = async (req, res) => {
  await service.remove(req.user, req.params.id);
  return noContent(res);
};
export const requestReview = async (req, res) =>
  ok(res, await service.requestReview(req.user, req.params.id, req.body), {
    message: "Review requested",
  });
export const scheduleMeeting = async (req, res) =>
  created(res, await service.scheduleMeeting(req.user, req.params.id, req.body), {
    message: "Meeting requested",
  });
export const addResource = async (req, res) =>
  created(res, await service.addResource(req.user, req.params.id, req.body), {
    message: "Resource added",
  });
export const removeResource = async (req, res) =>
  ok(res, await service.removeResource(req.user, req.params.id, req.params.resourceId));
export const addDocumentation = async (req, res) =>
  created(res, await service.addDocumentation(req.user, req.params.id, req.body), {
    message: "Documentation shared",
  });
export const removeDocumentation = async (req, res) =>
  ok(res, await service.removeDocumentation(req.user, req.params.id, req.params.key));
