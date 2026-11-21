import { ApiError } from "../../utils/ApiError.js";
import { FEEDBACK_STATUS, ROLES } from "../../config/constants.js";
import { escapeRegex, skipOf } from "../../utils/pagination.js";
import { nextCode } from "../common/counter.model.js";
import { scopeFilter } from "../common/scope.js";
import { User } from "../users/user.model.js";
import { Task } from "../tasks/task.model.js";
import { syncTask } from "../tasks/task.service.js";
import { notify } from "../notifications/notification.service.js";
import { logActivity } from "../admin/activity.service.js";
import { Feedback } from "./feedback.model.js";
import { serializeFeedback } from "./feedback.serializer.js";

const POPULATE = [
  { path: "mentor", select: "name code email role avatar specialty" },
  { path: "mentee", select: "name code email role avatar" },
  { path: "project", select: "name code" },
  { path: "task", select: "title code" },
];

async function findScoped(user, id) {
  const scope = await scopeFilter(user, "feedback");
  const item = await Feedback.findOne({ _id: id, ...scope });
  if (!item) throw ApiError.notFound("Feedback not found");
  return item;
}

const reload = async (id) => serializeFeedback(await Feedback.findById(id).populate(POPULATE).lean());

const assertStaff = (user) => {
  if (user.role === ROLES.INTERN) throw ApiError.forbidden("Only mentors and admins can do this");
};

export async function list(user, query) {
  const filter = { ...(await scopeFilter(user, "feedback")) };
  if (query.status) filter.status = query.status;
  if (query.mentee) filter.mentee = query.mentee;
  if (query.search) {
    filter.$and = [
      { $or: [{ title: { $regex: escapeRegex(query.search), $options: "i" } }, { category: { $regex: escapeRegex(query.search), $options: "i" } }] },
    ];
  }
  const [items, total] = await Promise.all([
    Feedback.find(filter).sort({ createdAt: -1 }).skip(skipOf(query)).limit(query.limit).populate(POPULATE).lean(),
    Feedback.countDocuments(filter),
  ]);
  return { items: items.map(serializeFeedback), total };
}

export async function getById(user, id) {
  await findScoped(user, id);
  return reload(id);
}

/** Mentor/admin gives feedback to an intern on their own initiative. */
export async function give(user, input) {
  assertStaff(user);
  const mentee = await User.findOne({ _id: input.menteeId, role: ROLES.INTERN, isActive: true });
  if (!mentee) throw ApiError.unprocessable("Intern not found", { code: "INVALID_INTERN" });
  let mentorId = user._id;
  if (user.role === ROLES.ADMIN && input.mentorId) {
    const mentor = await User.findOne({ _id: input.mentorId, role: ROLES.MENTOR, isActive: true });
    if (!mentor) throw ApiError.unprocessable("Mentor not found", { code: "INVALID_MENTOR" });
    mentorId = mentor._id;
  }

  const item = await Feedback.create({
    code: await nextCode("feedback", "FB"),
    title: input.title,
    category: input.category,
    status: input.status,
    rating: input.rating,
    mentor: mentorId,
    mentee: mentee._id,
    project: input.projectId ?? undefined,
    task: input.taskId ?? undefined,
    summary: input.summary,
    strengths: input.strengths,
    improvements: input.improvements,
  });
  await notify(mentee._id, {
    type: "feedback-received",
    title: "New mentor feedback",
    description: `${user.name} left feedback on "${item.title}".`,
    category: "Mentor activity",
    accent: "violet",
    actionLabel: "Read feedback",
    link: "/dashboard/feedback",
  });
  await logActivity({
    type: "feedback-given",
    title: `Feedback on "${item.title}"`,
    detail: `${mentee.name} · ${item.status}`,
    actor: user,
  });
  return reload(item._id);
}

/** Intern asks a mentor for feedback. The request stays "In Review" until the mentor answers. */
export async function request(user, input) {
  if (user.role !== ROLES.INTERN) throw ApiError.forbidden("Only interns can request feedback");
  const mentor = await User.findOne({ _id: input.mentorId, role: ROLES.MENTOR, isActive: true, isApproved: true });
  if (!mentor) throw ApiError.unprocessable("Mentor not found", { code: "INVALID_MENTOR" });

  const item = await Feedback.create({
    code: await nextCode("feedback", "FB"),
    title: input.subject,
    category: "Mentorship Request",
    status: FEEDBACK_STATUS.IN_REVIEW,
    mentor: mentor._id,
    mentee: user._id,
    project: input.projectId ?? undefined,
    task: input.taskId ?? undefined,
    summary: input.message || "Intern requested review from mentor.",
    isRequest: true,
  });
  await notify(mentor._id, {
    type: "feedback-requested",
    title: "Feedback requested",
    description: `${user.name} wants feedback on "${item.title}".`,
    category: "Review queue",
    accent: "amber",
    actionLabel: "Respond",
    link: "/mentor/feedback",
  });
  await logActivity({
    type: "feedback-requested",
    title: `Feedback requested: "${item.title}"`,
    detail: `Sent to ${mentor.name}`,
    actor: user,
  });
  return reload(item._id);
}

export async function respond(user, id, input) {
  assertStaff(user);
  const item = await findScoped(user, id);
  if (!item.isRequest) throw ApiError.conflict("This feedback has already been answered", { code: "NOT_A_REQUEST" });

  item.status = input.status;
  item.rating = input.rating ?? 5;
  if (input.summary) item.summary = input.summary;
  item.strengths = input.strengths.length ? input.strengths : ["Review complete and expectations met."];
  item.improvements = input.improvements;
  item.isRequest = false;
  item.respondedAt = new Date();
  item.mentor = user._id;
  await item.save();

  await notify(item.mentee, {
    type: "feedback-received",
    title: "Your feedback request was answered",
    description: `${user.name} responded to "${item.title}".`,
    category: "Mentor activity",
    accent: "violet",
    actionLabel: "Read feedback",
    link: "/dashboard/feedback",
  });
  await logActivity({
    type: "feedback-responded",
    title: "Responded to feedback request",
    detail: `${item.title} · ${item.status}`,
    actor: user,
  });
  return reload(id);
}

export async function setStatus(user, id, { status }) {
  const item = await findScoped(user, id);
  item.status = status;
  await item.save();
  return reload(id);
}

/** Intern turns one of the mentor's improvement points into a new step of the linked task. */
export async function addSuggestionToTask(user, id, index) {
  if (user.role !== ROLES.INTERN) throw ApiError.forbidden("Only the intern can add suggestions to a task");
  const item = await findScoped(user, id);
  const text = item.improvements[index];
  if (!text) throw ApiError.notFound("Suggestion not found");
  if (!item.task) {
    throw ApiError.unprocessable("This feedback is not linked to a task", { code: "NO_TASK" });
  }
  if (item.addedSuggestionIds.includes(index)) return reload(id);

  const task = await Task.findOne({ _id: item.task, assignees: user._id });
  if (!task) throw ApiError.notFound("Task not found");
  task.steps.push({ text, sourceFeedback: item._id, suggestionIndex: index });
  await syncTask(task);

  item.addedSuggestionIds.push(index);
  await item.save();
  return reload(id);
}
