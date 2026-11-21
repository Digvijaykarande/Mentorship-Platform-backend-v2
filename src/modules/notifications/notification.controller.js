import { noContent, ok } from "../../utils/apiResponse.js";
import * as service from "./notification.service.js";

export const list = async (req, res) => ok(res, await service.list(req.user));
export const toggleRead = async (req, res) => ok(res, await service.toggleRead(req.user, req.params.id));
export const markAllRead = async (req, res) => {
  await service.markAllRead(req.user);
  return ok(res, null, { message: "All notifications marked as read" });
};
export const remove = async (req, res) => {
  await service.remove(req.user, req.params.id);
  return noContent(res);
};
export const clearAll = async (req, res) => {
  await service.clearAll(req.user);
  return noContent(res);
};
