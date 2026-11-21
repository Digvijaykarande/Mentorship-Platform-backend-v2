import { idOf, iso, personOf } from "../../utils/serialize.js";

/** Full record for staff screens. `stats` is computed across collections by the service. */
export const serializeUser = (u, stats = {}) => ({
  id: idOf(u),
  code: u.code,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  isApproved: Boolean(u.isApproved),
  isActive: Boolean(u.isActive),
  team: u.team ?? "",
  cohort: u.cohort ?? "",
  mentor: u.mentor?._id ? personOf(u.mentor) : u.mentor ? { id: idOf(u.mentor) } : null,
  specialty: u.specialty ?? "",
  capacity: u.capacity ?? 0,
  avatarUrl: u.avatar?.url ?? null,
  joinedAt: iso(u.joinedAt ?? u.createdAt),
  lastLoginAt: iso(u.lastLoginAt),
  progress: stats.progress ?? 0,
  internCount: stats.internCount ?? 0,
  rating: stats.rating ?? null,
});

/** What an intern may know about a mentor (for the "request feedback" picker). */
export const serializeMentorOption = (u) => ({
  id: idOf(u),
  name: u.name,
  specialty: u.specialty ?? "",
  label: u.specialty ? `${u.name} — ${u.specialty}` : u.name,
});
