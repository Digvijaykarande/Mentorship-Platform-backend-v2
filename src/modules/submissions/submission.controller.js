import { created, noContent, ok, pageMeta } from "../../utils/apiResponse.js";
import * as service from "./submission.service.js";

export const list = async (req, res) => {
  const query = req.validated.query;
  const { items, total } = await service.list(req.user, query);
  return ok(res, items, { meta: pageMeta({ page: query.page, limit: query.limit, total }) });
};
export const get = async (req, res) => ok(res, await service.getById(req.user, req.params.id));

export const create = async (req, res) => {
  const { submission, changed } = await service.create(req.user, req.body);
  return created(res, submission, { message: "Submitted for review", meta: { changed } });
};
export const edit = async (req, res) => {
  const { submission, changed } = await service.edit(req.user, req.params.id, req.body);
  return ok(res, submission, { message: changed ? "Changes saved" : "No changes to save", meta: { changed } });
};
export const revise = async (req, res) => {
  const { submission, changed } = await service.revise(req.user, req.params.id, req.body);
  return ok(res, submission, { message: "Revision sent", meta: { changed } });
};
export const withdraw = async (req, res) =>
  ok(res, await service.withdraw(req.user, req.params.id), { message: "Submission withdrawn" });
export const restore = async (req, res) =>
  ok(res, await service.restore(req.user, req.params.id), { message: "Submission restored" });
export const remove = async (req, res) => {
  await service.remove(req.user, req.params.id);
  return noContent(res);
};
export const review = async (req, res) =>
  ok(res, await service.review(req.user, req.params.id, req.body), { message: "Review saved" });
