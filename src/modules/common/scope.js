/**
 * Who may see what.
 *   admin   everything
 *   mentor  their own interns + whatever they created/mentor themselves
 *   intern  only their own records
 * Every list/read query goes through one of these so the rule lives in one place.
 */
import { ROLES } from "../../config/constants.js";
import { User } from "../users/user.model.js";
import { Task } from "../tasks/task.model.js";
import { Project } from "../projects/project.model.js";

/** Intern ids a mentor is responsible for (assigned directly, or via their tasks/projects). */
export async function mentorInternIds(mentorId) {
  const [direct, viaTasks, viaProjects] = await Promise.all([
    User.find({ role: ROLES.INTERN, mentor: mentorId }).distinct("_id"),
    Task.find({ createdBy: mentorId }).distinct("assignees"),
    Project.find({ $or: [{ mentor: mentorId }, { createdBy: mentorId }] }).distinct("assignees"),
  ]);
  const unique = new Map();
  [...direct, ...viaTasks, ...viaProjects].forEach((id) => unique.set(String(id), id));
  return [...unique.values()];
}

const isAdmin = (user) => user.role === ROLES.ADMIN;

/** Mongo filters restricting each collection to what `user` may see. `{}` means no restriction. */
export async function scopeFilter(user, kind) {
  if (isAdmin(user)) return {};
  if (user.role === ROLES.INTERN) {
    return {
      tasks: { assignees: user._id },
      projects: { assignees: user._id },
      submissions: { intern: user._id },
      feedback: { mentee: user._id },
      users: { _id: user._id },
    }[kind];
  }
  const ids = await mentorInternIds(user._id);
  return {
    tasks: { $or: [{ createdBy: user._id }, { assignees: { $in: ids } }] },
    projects: { $or: [{ mentor: user._id }, { createdBy: user._id }, { assignees: { $in: ids } }] },
    submissions: { intern: { $in: ids } },
    feedback: { $or: [{ mentor: user._id }, { mentee: { $in: ids } }] },
    // Mentors can assign work to any intern, so they need to see all interns and mentors (never admins).
    users: { role: { $in: [ROLES.INTERN, ROLES.MENTOR] } },
  }[kind];
}

/**
 * Who should be told that an intern did something that needs a review: the interns' mentors plus
 * anyone passed in `extra` (e.g. the task creator). Falls back to every admin so nothing is lost.
 */
export async function reviewerIdsFor(internIds, extra = []) {
  const mentors = await User.find({ _id: { $in: internIds } }).distinct("mentor");
  const wanted = [...mentors, ...extra].filter(Boolean);
  const staff = wanted.length
    ? await User.find({
        _id: { $in: wanted },
        role: { $in: [ROLES.MENTOR, ROLES.ADMIN] },
        isActive: true,
      }).distinct("_id")
    : [];
  if (staff.length) return staff;
  return User.find({ role: ROLES.ADMIN, isActive: true }).distinct("_id");
}
