import { created, noContent, ok, pageMeta } from "../../utils/apiResponse.js";
import * as service from "./user.admin.service.js";

export const list = async (req, res) => {
  const query = req.validated.query;
  const { items, total } = await service.list(req.user, query);
  return ok(res, items, { meta: pageMeta({ page: query.page, limit: query.limit, total }) });
};
export const mentorOptions = async (_req, res) => ok(res, await service.mentorOptions());
export const create = async (req, res) =>
  created(res, await service.create(req.user, req.body), { message: "Account created" });
export const update = async (req, res) => ok(res, await service.update(req.user, req.params.id, req.body));
export const approve = async (req, res) =>
  ok(res, await service.approve(req.user, req.params.id), { message: "Mentor approved" });
export const deactivate = async (req, res) =>
  ok(res, await service.deactivate(req.user, req.params.id), { message: "Account deactivated" });
export const resetPassword = async (req, res) => {
  await service.resetPassword(req.user, req.params.id, req.body);
  return noContent(res);
};
