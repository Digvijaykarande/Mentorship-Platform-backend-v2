import { created, ok, pageMeta } from "../../utils/apiResponse.js";
import * as service from "./feedback.service.js";

export const list = async (req, res) => {
  const query = req.validated.query;
  const { items, total } = await service.list(req.user, query);
  return ok(res, items, { meta: pageMeta({ page: query.page, limit: query.limit, total }) });
};
export const get = async (req, res) => ok(res, await service.getById(req.user, req.params.id));
export const give = async (req, res) =>
  created(res, await service.give(req.user, req.body), { message: "Feedback sent" });
export const request = async (req, res) =>
  created(res, await service.request(req.user, req.body), { message: "Request sent to your mentor" });
export const respond = async (req, res) =>
  ok(res, await service.respond(req.user, req.params.id, req.body), { message: "Response sent" });
export const setStatus = async (req, res) =>
  ok(res, await service.setStatus(req.user, req.params.id, req.body));
export const addSuggestion = async (req, res) =>
  ok(res, await service.addSuggestionToTask(req.user, req.params.id, Number(req.params.index)), {
    message: "Added to your task",
  });
