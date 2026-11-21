import { Notification } from "./notification.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { logger } from "../../utils/logger.js";
import { idOf, iso } from "../../utils/serialize.js";

export const serializeNotification = (n) => ({
  id: idOf(n),
  type: n.type,
  title: n.title,
  description: n.description ?? "",
  category: n.category ?? "",
  accent: n.accent,
  actionLabel: n.actionLabel ?? "",
  link: n.link ?? "",
  unread: Boolean(n.unread),
  createdAt: iso(n.createdAt),
});

/**
 * Create a notification for one or many users. It must never break the action that triggered it
 * (approving a submission, assigning a task, ...), so failures are logged and swallowed.
 */
export async function notify(userIds, payload) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
  if (!ids.length) return;
  try {
    await Notification.insertMany(ids.map((user) => ({ user, ...payload })));
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to create notification");
  }
}

export async function list(user) {
  const items = await Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(200).lean();
  return items.map(serializeNotification);
}

export async function toggleRead(user, id) {
  const item = await Notification.findOne({ _id: id, user: user._id });
  if (!item) throw ApiError.notFound("Notification not found");
  item.unread = !item.unread;
  await item.save();
  return serializeNotification(item);
}

export const markAllRead = (user) =>
  Notification.updateMany({ user: user._id, unread: true }, { $set: { unread: false } });

export async function remove(user, id) {
  const res = await Notification.deleteOne({ _id: id, user: user._id });
  if (!res.deletedCount) throw ApiError.notFound("Notification not found");
}

export const clearAll = (user) => Notification.deleteMany({ user: user._id });
