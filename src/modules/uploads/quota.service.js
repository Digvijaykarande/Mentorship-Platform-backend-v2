import { ROLES } from "../../config/constants.js";
import { ApiError } from "../../utils/ApiError.js";
import { idOf } from "../../utils/serialize.js";
import { notify } from "../notifications/notification.service.js";
import { Notification } from "../notifications/notification.model.js";
import { User } from "../users/user.model.js";
import { formatBytes, quotaFor, usedBytesOf } from "./usage.service.js";

const DAY = 24 * 60 * 60 * 1000;

/** Admin sets (or, with null, resets) one person's storage limit in MB. */
export async function setQuota(targetId, quotaMb) {
  const target = await User.findById(targetId);
  if (!target) throw ApiError.notFound("User not found");
  if (target.role === ROLES.ADMIN) {
    throw ApiError.badRequest("Admins have unlimited storage", { code: "QUOTA_NOT_APPLICABLE" });
  }
  if (quotaMb === null) target.set("storageQuotaMb", undefined);
  else target.storageQuotaMb = quotaMb;
  await target.save();

  const bytes = quotaFor(target);
  await notify(target._id, {
    type: "storage-updated",
    title: "Your storage limit was updated",
    description: `You now have ${formatBytes(bytes)} of storage.`,
    category: "Storage",
    accent: "emerald",
    actionLabel: "View storage",
    link: target.role === ROLES.MENTOR ? "/mentor/storage" : "/dashboard/storage",
  });
  return { id: idOf(target), quotaMb: target.storageQuotaMb ?? null, quotaBytes: bytes, quotaReadable: formatBytes(bytes), isCustomQuota: target.storageQuotaMb != null };
}

/** An intern or mentor asks the admins for more space. One open request per person per day. */
export async function requestMoreSpace(user, { requestedMb, reason }) {
  if (user.role === ROLES.ADMIN) throw ApiError.badRequest("Admins have unlimited storage");

  const type = `storage-request:${idOf(user)}`;
  const recent = await Notification.exists({ type, createdAt: { $gte: new Date(Date.now() - DAY) } });
  if (recent) {
    throw new ApiError(429, "You already asked for more space today. An admin will get back to you.", {
      code: "STORAGE_REQUEST_EXISTS",
    });
  }

  const admins = await User.find({ role: ROLES.ADMIN, isActive: true }).distinct("_id");
  const used = await usedBytesOf(user);
  const quota = quotaFor(user);
  const parts = [
    `${user.role === ROLES.MENTOR ? "Mentor" : "Intern"} · ${formatBytes(used)} of ${formatBytes(quota)} used`,
    requestedMb ? `asks for +${requestedMb >= 1024 ? `${requestedMb / 1024} GB` : `${requestedMb} MB`}` : null,
    reason ? `"${reason}"` : null,
  ].filter(Boolean);

  await notify(admins, {
    type,
    title: `${user.name} needs more storage`,
    description: parts.join(" · ").slice(0, 500),
    category: "Storage",
    accent: "amber",
    actionLabel: "Manage storage",
    link: "/admin/storage",
  });
  return { sent: admins.length > 0 };
}
