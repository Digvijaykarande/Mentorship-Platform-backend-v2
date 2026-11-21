import { env } from "../../config/env.js";
import { ROLES } from "../../config/constants.js";
import { ApiError } from "../../utils/ApiError.js";
import { idOf } from "../../utils/serialize.js";
import { mentorInternIds } from "../common/scope.js";
import { Project } from "../projects/project.model.js";
import { Submission } from "../submissions/submission.model.js";
import { Task } from "../tasks/task.model.js";
import { User } from "../users/user.model.js";

/**
 * Storage used per person. Read-only: nothing in the upload flow changes.
 * Summed from the `size` stored next to every uploaded file, per source:
 *   submissions    files an intern handed in
 *   resources      files added to a project's "Resources & Specs" (by interns or mentors)
 *   documentation  files a mentor shared in project documentation
 *   taskReferences files a mentor attached to a task
 * Links have no size so they never count. Withdrawn submissions still count (the file stays on
 * Cloudinary); deleting a record removes it from the total.
 */
export const SOURCES = ["submissions", "resources", "documentation", "taskReferences"];

const group = (field) => ({
  $group: {
    _id: field,
    bytes: { $sum: { $ifNull: ["$f.size", 0] } },
    files: { $sum: 1 },
  },
});
const withSize = { $match: { "f.size": { $gt: 0 } } };

async function rowsBySource() {
  const [submissions, resources, documentation, taskReferences] = await Promise.all([
    Submission.aggregate([{ $unwind: { path: "$files" } }, { $set: { f: "$files" } }, withSize, group("$intern")]),
    Project.aggregate([{ $unwind: "$resources" }, { $set: { f: "$resources" } }, withSize, group("$f.uploadedBy")]),
    Project.aggregate([
      { $unwind: "$documentation.sections" },
      { $unwind: "$documentation.sections.attachments" },
      { $set: { f: "$documentation.sections.attachments", by: "$documentation.sections.addedBy" } },
      withSize,
      group("$by"),
    ]),
    Task.aggregate([{ $unwind: "$resources" }, { $set: { f: "$resources" } }, withSize, group("$f.uploadedBy")]),
  ]);
  return { submissions, resources, documentation, taskReferences };
}

/** Pure: fold the per-source rows into one entry per user. */
export function mergeUsage(rows) {
  const byUser = new Map();
  for (const source of SOURCES) {
    for (const row of rows[source] ?? []) {
      if (!row._id) continue;
      const key = String(row._id);
      const entry = byUser.get(key) ?? {
        bytes: 0,
        files: 0,
        breakdown: Object.fromEntries(SOURCES.map((s) => [s, { bytes: 0, files: 0 }])),
      };
      entry.bytes += row.bytes;
      entry.files += row.files;
      entry.breakdown[source] = { bytes: row.bytes, files: row.files };
      byUser.set(key, entry);
    }
  }
  return byUser;
}

const empty = () => ({
  bytes: 0,
  files: 0,
  breakdown: Object.fromEntries(SOURCES.map((s) => [s, { bytes: 0, files: 0 }])),
});

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // keep in sync with signUpload()
const MB = 1024 * 1024;

/** Default limits per role in bytes (intern 5 GB, mentor 10 GB). Admins have none. */
export const defaultQuotaFor = (role) => {
  if (role === ROLES.INTERN) return Math.round(env.STORAGE_QUOTA_INTERN_MB * MB);
  if (role === ROLES.MENTOR) return Math.round(env.STORAGE_QUOTA_MENTOR_MB * MB);
  return null;
};

/**
 * Storage limit in bytes for a person (or a bare role string), or null when unlimited (admins).
 * An admin can give one person a custom limit (`storageQuotaMb`); otherwise the role default applies.
 */
export function quotaFor(who) {
  const role = typeof who === "string" ? who : who?.role;
  if (role !== ROLES.INTERN && role !== ROLES.MENTOR) return null;
  const custom = typeof who === "object" ? who?.storageQuotaMb : null;
  return custom != null ? Math.round(custom * MB) : defaultQuotaFor(role);
}

export const WARN_AT = 0.8;
export const CRITICAL_AT = 0.95;

/** Pure: how full is a quota? level drives the colour / message in the UI. */
export function quotaState(bytes, quotaBytes) {
  if (quotaBytes === null) {
    return { quotaBytes: null, quotaReadable: "Unlimited", percent: 0, remainingBytes: null, remainingReadable: "Unlimited", level: "ok" };
  }
  const ratio = quotaBytes > 0 ? bytes / quotaBytes : 1;
  const remaining = Math.max(0, quotaBytes - bytes);
  const level = ratio >= 1 ? "full" : ratio >= CRITICAL_AT ? "critical" : ratio >= WARN_AT ? "warning" : "ok";
  return {
    quotaBytes,
    quotaReadable: formatBytes(quotaBytes),
    percent: Math.min(100, Math.round(ratio * 1000) / 10),
    remainingBytes: remaining,
    remainingReadable: formatBytes(remaining),
    level,
  };
}

const present = (id, user, usage) => ({
  id,
  name: user?.name ?? "Unknown user",
  code: user?.code,
  email: user?.email,
  role: user?.role,
  isActive: user?.isActive ?? true,
  isCustomQuota: user?.storageQuotaMb != null,
  bytes: usage.bytes,
  files: usage.files,
  readable: formatBytes(usage.bytes),
  ...quotaState(usage.bytes, quotaFor(user)),
  breakdown: Object.fromEntries(
    Object.entries(usage.breakdown).map(([k, v]) => [k, { ...v, readable: formatBytes(v.bytes) }]),
  ),
});

/**
 * `me`     the signed-in user's own usage (always present)
 * `users`  who the caller may see: admin everyone, mentor themselves + their interns, intern only themselves
 */
export async function storageUsage(user) {
  const merged = mergeUsage(await rowsBySource());
  const myId = idOf(user);

  let ids;
  if (user.role === ROLES.ADMIN) {
    // Admins see every active intern and mentor, including people who have not uploaded anything yet.
    const everyone = await User.find({ role: { $in: [ROLES.INTERN, ROLES.MENTOR] }, isActive: true }).distinct("_id");
    ids = [...new Set([...everyone.map(String), ...merged.keys()])];
  } else if (user.role === ROLES.MENTOR) {
    const interns = (await mentorInternIds(user._id)).map(String);
    ids = [...new Set([myId, ...interns])];
  } else {
    ids = [myId];
  }
  const people = await User.find({ _id: { $in: [...new Set([...ids, myId])] } })
    .select("name email code role isActive storageQuotaMb")
    .lean();
  const byId = new Map(people.map((p) => [String(p._id), p]));

  const users = ids
    .map((id) => present(id, byId.get(id), merged.get(id) ?? empty()))
    .sort((a, b) => b.bytes - a.bytes);
  const totalBytes = users.reduce((sum, u) => sum + u.bytes, 0);

  return {
    me: present(myId, byId.get(myId) ?? user, merged.get(myId) ?? empty()),
    defaults: {
      intern: { bytes: defaultQuotaFor(ROLES.INTERN), readable: formatBytes(defaultQuotaFor(ROLES.INTERN)) },
      mentor: { bytes: defaultQuotaFor(ROLES.MENTOR), readable: formatBytes(defaultQuotaFor(ROLES.MENTOR)) },
    },
    maxFileBytes: MAX_FILE_BYTES,
    users,
    totalBytes,
    totalReadable: formatBytes(totalBytes),
  };
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${Number(value.toFixed(value < 10 ? 2 : 1))} ${units[i]}`;
}

/** Bytes this user has stored right now (used to enforce the limit before a new upload is signed). */
export async function usedBytesOf(user) {
  const merged = mergeUsage(await rowsBySource());
  return merged.get(idOf(user))?.bytes ?? 0;
}

/**
 * Throws a 413 when `incomingBytes` more would push the user over their limit.
 * Unlimited roles (admins) always pass. With no size given it only blocks a user who is already full.
 */
export async function assertStorageAvailable(user, incomingBytes = 0) {
  const quota = quotaFor(user);
  if (quota === null) return;
  const used = await usedBytesOf(user);
  if (used + incomingBytes > quota || used >= quota) {
    const left = Math.max(0, quota - used);
    throw new ApiError(
      413,
      incomingBytes
        ? `Not enough storage. You have ${formatBytes(left)} left of ${formatBytes(quota)} and this file is ${formatBytes(incomingBytes)}. Delete some files or ask your admin for more space.`
        : `Your ${formatBytes(quota)} of storage is full. Delete some files or ask your admin for more space.`,
      { code: "STORAGE_FULL", details: { used, quota, left } },
    );
  }
}
