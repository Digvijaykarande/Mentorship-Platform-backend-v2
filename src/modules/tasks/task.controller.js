import { created, noContent, ok, pageMeta } from "../../utils/apiResponse.js";
import * as service from "./task.service.js";

export const list = async (req, res) => {
  const query = req.validated.query;
  const { items, total } = await service.list(req.user, query);
  return ok(res, items, { meta: pageMeta({ page: query.page, limit: query.limit, total }) });
};

export const get = async (req, res) => ok(res, await service.getById(req.user, req.params.id));
export const create = async (req, res) =>
  created(res, await service.create(req.user, req.body), { message: "Task created" });
export const update = async (req, res) =>
  ok(res, await service.update(req.user, req.params.id, req.body), { message: "Task updated" });
export const remove = async (req, res) => {
  await service.remove(req.user, req.params.id);
  return noContent(res);
};

export const addStep = async (req, res) =>
  created(res, await service.addStep(req.user, req.params.id, req.body));
export const updateStep = async (req, res) =>
  ok(res, await service.updateStep(req.user, req.params.id, req.params.stepId, req.body));
export const removeStep = async (req, res) =>
  ok(res, await service.removeStep(req.user, req.params.id, req.params.stepId));
export const completeStep = async (req, res) =>
  ok(res, await service.completeStep(req.user, req.params.id, req.params.stepId), {
    message: "Step sent for review",
  });
export const approveStep = async (req, res) =>
  ok(res, await service.approveStep(req.user, req.params.id, req.params.stepId, req.body), {
    message: "Step approved",
  });
export const requestChanges = async (req, res) =>
  ok(res, await service.requestChanges(req.user, req.params.id, req.params.stepId, req.body), {
    message: "Changes requested",
  });
