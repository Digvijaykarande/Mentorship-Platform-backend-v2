import { ApiError } from "../../utils/ApiError.js";
import { ROLES, USER_STATUS } from "../../config/constants.js";
import { escapeRegex, skipOf } from "../../utils/pagination.js";
import { idOf } from "../../utils/serialize.js";
import { nextCode } from "../common/counter.model.js";
import { scopeFilter } from "../common/scope.js";
import { hashPassword } from "../auth/password.js";
import { RefreshToken } from "../auth/refreshToken.model.js";
import { Task } from "../tasks/task.model.js";
import { taskProgress } from "../tasks/taskSteps.js";
import { Feedback } from "../feedback/feedback.model.js";
import { logActivity } from "../admin/activity.service.js";
import { notify } from "../notifications/notification.service.js";
import { User } from "./user.model.js";
import { serializeMentorOption, serializeUser } from "./user.serializer.js";

const POPULATE = [{ path: "mentor", select: "name code email role avatar" }];

async function codeFor(role) {
  if (role === ROLES.MENTOR) return nextCode("user-mentor", "MTR", { start: 0, pad: 3 });
  const year = new Date().getFullYear();
  return nextCode(`user-intern-${year}`, `LYX-INT-${year}`, { start: 0, pad: 3 });
}

/** Progress per intern, intern counts and ratings per mentor, in three queries for the whole page. */
async function statsFor(users) {
  const internIds = users.filter((u) => u.role === ROLES.INTERN).map((u) => u._id);
  const mentorIds = users.filter((u) => u.role === ROLES.MENTOR).map((u) => u._id);
  const [tasks, assigned, ratings] = await Promise.all([
    internIds.length ? Task.find({ assignees: { $in: internIds } }).select("assignees steps").lean() : [],
    mentorIds.length ? User.find({ role: ROLES.INTERN, mentor: { $in: mentorIds }, isActive: true }).select("mentor").lean() : [],
    mentorIds.length ? Feedback.find({ mentor: { $in: mentorIds }, rating: { $gt: 0 } }).select("mentor rating").lean() : [],
  ]);

  const stats = new Map();
  for (const id of internIds) {
    const mine = tasks.filter((t) => t.assignees.some((a) => idOf(a) === idOf(id)));
    const progress = mine.length
      ? Math.round(mine.reduce((sum, t) => sum + taskProgress(t.steps).percent, 0) / mine.length)
      : 0;
    stats.set(idOf(id), { progress });
  }
  for (const id of mentorIds) {
    const rated = ratings.filter((r) => idOf(r.mentor) === idOf(id));
    stats.set(idOf(id), {
      internCount: assigned.filter((a) => idOf(a.mentor) === idOf(id)).length,
      rating: rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10 : null,
    });
  }
  return stats;
}

const withStats = async (users) => {
  const stats = await statsFor(users);
  return users.map((u) => serializeUser(u, stats.get(idOf(u))));
};

/* -------------------------------- queries ----------------------------- */

export async function list(user, query) {
  const filter = { ...(await scopeFilter(user, "users")) };
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$and = [{ $or: [{ name: rx }, { email: rx }, { team: rx }] }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: 1 }).skip(skipOf(query)).limit(query.limit).populate(POPULATE).lean(),
    User.countDocuments(filter),
  ]);
  return { items: await withStats(items), total };
}

/** Any signed-in user: approved, active mentors (used by the intern's feedback request form). */
export async function mentorOptions() {
  const mentors = await User.find({ role: ROLES.MENTOR, isActive: true, isApproved: true }).sort({ name: 1 }).lean();
  return mentors.map(serializeMentorOption);
}

/* ------------------------------- mutations ---------------------------- */

async function resolveMentor(mentorId) {
  if (!mentorId) return undefined;
  const mentor = await User.findOne({ _id: mentorId, role: ROLES.MENTOR, isActive: true });
  if (!mentor) throw ApiError.unprocessable("Mentor not found", { code: "INVALID_MENTOR" });
  return mentor._id;
}

export async function create(admin, input) {
  if (await User.exists({ email: input.email })) {
    throw ApiError.conflict("An account with this email already exists", { code: "EMAIL_TAKEN" });
  }
  const [firstName, ...rest] = input.name.split(/\s+/);
  const created = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    code: await codeFor(input.role),
    status: input.role === ROLES.MENTOR ? USER_STATUS.AVAILABLE : USER_STATUS.ACTIVE,
    isApproved: true, // created by an admin, so no approval step
    team: input.team,
    cohort: input.cohort,
    mentor: input.role === ROLES.INTERN ? await resolveMentor(input.mentorId) : undefined,
    specialty: input.specialty,
    capacity: input.capacity,
    profile: { firstName, lastName: rest.join(" ") },
  });
  await logActivity({ type: "user-created", title: `${created.name} added`, detail: created.role, actor: admin });
  return (await withStats([await User.findById(created._id).populate(POPULATE).lean()]))[0];
}

export async function update(admin, id, input) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound("User not found");
  if (idOf(user) === idOf(admin) && (input.isActive === false || input.isApproved === false)) {
    throw ApiError.conflict("You cannot disable your own account", { code: "SELF_DISABLE" });
  }

  for (const key of ["name", "team", "cohort", "specialty", "capacity", "status", "isApproved", "isActive"]) {
    if (input[key] !== undefined) user[key] = input[key];
  }
  if (input.name !== undefined) {
    const [firstName, ...rest] = input.name.split(/\s+/);
    user.profile.firstName = firstName;
    user.profile.lastName = rest.join(" ");
  }
  if (input.mentorId !== undefined && user.role === ROLES.INTERN) {
    user.mentor = await resolveMentor(input.mentorId);
  }
  await user.save();
  if (input.isActive === false) await revokeSessions(user._id);
  return (await withStats([await User.findById(id).populate(POPULATE).lean()]))[0];
}

export async function approve(admin, id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound("User not found");
  user.isApproved = true;
  await user.save();
  await notify(user._id, {
    type: "account-approved",
    title: "Your mentor account is approved",
    description: "You can now review work and give feedback.",
    category: "Account",
    accent: "emerald",
    actionLabel: "Open dashboard",
    link: "/mentor",
  });
  await logActivity({ type: "mentor-approved", title: `${user.name} approved`, actor: admin });
  return (await withStats([await User.findById(id).populate(POPULATE).lean()]))[0];
}

const revokeSessions = (userId) =>
  RefreshToken.updateMany({ user: userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });

/** Accounts are deactivated, never deleted, so tasks, submissions and feedback keep their history. */
export async function deactivate(admin, id) {
  return update(admin, id, { isActive: false, status: USER_STATUS.INACTIVE });
}

/** There is no email service yet, so admins can set a new password for someone who forgot theirs. */
export async function resetPassword(admin, id, { newPassword }) {
  const user = await User.findById(id).select("+passwordHash");
  if (!user) throw ApiError.notFound("User not found");
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();
  await revokeSessions(user._id);
  await logActivity({ type: "password-reset", title: `Password reset for ${user.name}`, actor: admin });
}
