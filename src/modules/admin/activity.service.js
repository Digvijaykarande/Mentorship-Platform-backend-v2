import { Activity } from "./activity.model.js";
import { logger } from "../../utils/logger.js";
import { idOf, iso } from "../../utils/serialize.js";

export const serializeActivity = (a) => ({
  id: idOf(a),
  type: a.type,
  title: a.title,
  detail: a.detail ?? "",
  actor: a.actor?.name ? { id: idOf(a.actor), name: a.actor.name } : null,
  createdAt: iso(a.createdAt),
});

/** Audit trail for the admin overview. Like notifications, it must never fail the real action. */
export async function logActivity({ type, title, detail, actor, project, task, submission }) {
  try {
    await Activity.create({ type, title, detail, actor: actor?._id ?? actor, project, task, submission });
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to log activity");
  }
}

export async function recent({ limit = 20, actorFilter } = {}) {
  const items = await Activity.find(actorFilter ?? {})
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("actor", "name")
    .lean();
  return items.map(serializeActivity);
}
