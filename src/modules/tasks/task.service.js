import { ApiError } from "../../utils/ApiError.js";
import { ROLES, TASK_STATUS } from "../../config/constants.js";
import { escapeRegex, skipOf } from "../../utils/pagination.js";
import { idOf } from "../../utils/serialize.js";
import { nextCode } from "../common/counter.model.js";
import { reviewerIdsFor, scopeFilter } from "../common/scope.js";
import { User } from "../users/user.model.js";
import { Project } from "../projects/project.model.js";
import { recalcProjectProgress } from "../projects/project.progress.js";
import { notify } from "../notifications/notification.service.js";
import { logActivity } from "../admin/activity.service.js";
import { Task } from "./task.model.js";
import { serializeTask } from "./task.serializer.js";
import { STEP_STATE, stepStates, taskStatusOf } from "./taskSteps.js";

const POPULATE = [
  { path: "project", select: "name code" },
  { path: "assignees", select: "name code email role avatar" },
  { path: "createdBy", select: "name code email role avatar" },
];

const taskLink = (task) => `/dashboard/tasks?task=${idOf(task)}`;

/* ------------------------------- loading ------------------------------ */

async function findScoped(user, id) {
  const scope = await scopeFilter(user, "tasks");
  const task = await Task.findOne({ _id: id, ...scope });
  // 404 (not 403) so ids of other people's records are not revealed.
  if (!task) throw ApiError.notFound("Task not found");
  return task;
}

const reload = async (id) => serializeTask(await Task.findById(id).populate(POPULATE).lean());

/** Admin: always. Mentor: tasks they created or that belong to their interns (the scope already filtered). */
function assertCanManage(user, _task) {
  if (user.role === ROLES.ADMIN) return;
  if (user.role === ROLES.MENTOR) return;
  throw ApiError.forbidden("Only mentors and admins can change tasks", { code: "FORBIDDEN" });
}

/** Re-derive status + project progress after any change to the steps. */
export async function syncTask(task) {
  task.status = taskStatusOf(task.steps);
  await task.save();
  await recalcProjectProgress(task.project);
  return task;
}

async function resolveAssignees(ids) {
  const unique = [...new Set(ids)];
  const interns = await User.find({ _id: { $in: unique }, role: ROLES.INTERN, isActive: true }).select("_id");
  if (interns.length !== unique.length) {
    throw ApiError.unprocessable("One or more assignees are not active interns", {
      code: "INVALID_ASSIGNEES",
    });
  }
  return interns.map((i) => i._id);
}

async function assertProject(projectId) {
  if (!projectId) return null;
  const project = await Project.findById(projectId).select("_id");
  if (!project) throw ApiError.unprocessable("Project not found", { code: "INVALID_PROJECT" });
  return project._id;
}

/* -------------------------------- queries ----------------------------- */

export async function list(user, query) {
  const scope = await scopeFilter(user, "tasks");
  const filter = { ...scope };
  if (query.status) filter.status = query.status;
  if (query.project) filter.project = query.project;
  if (query.assignee) filter.assignees = query.assignee;
  if (query.search) filter.title = { $regex: escapeRegex(query.search), $options: "i" };

  const [items, total] = await Promise.all([
    Task.find(filter)
      .sort({ createdAt: -1 })
      .skip(skipOf(query))
      .limit(query.limit)
      .populate(POPULATE)
      .lean(),
    Task.countDocuments(filter),
  ]);
  return { items: items.map(serializeTask), total };
}

export async function getById(user, id) {
  await findScoped(user, id);
  return reload(id);
}

/* ------------------------------- mutations ---------------------------- */

export async function create(user, input) {
  assertCanManage(user, null);
  const [assignees, project] = await Promise.all([
    resolveAssignees(input.assigneeIds),
    assertProject(input.projectId),
  ]);

  const task = await Task.create({
    code: await nextCode("task", "TASK"),
    title: input.title,
    project,
    assignees,
    instructions: input.instructions,
    priority: input.priority,
    dueDate: input.dueDate ?? undefined,
    steps: input.steps.map((text) => ({ text })),
    resources: [...(input.resources ?? []), ...(input.resource ? [input.resource] : [])].map((r) => ({
      ...r,
      uploadedBy: user._id,
    })),
    createdBy: user._id,
    status: TASK_STATUS.TODO,
  });
  await recalcProjectProgress(project);

  await notify(assignees, {
    type: "task-assigned",
    title: "New task assigned",
    description: `${task.title} was assigned to you.`,
    category: "Mentor activity",
    accent: "blue",
    actionLabel: "View task",
    link: taskLink(task),
  });
  await logActivity({
    type: "task-assigned",
    title: `${task.title} assigned`,
    detail: `${assignees.length} intern${assignees.length === 1 ? "" : "s"}`,
    actor: user,
    task: task._id,
    project,
  });
  return reload(task._id);
}

export async function update(user, id, input) {
  const task = await findScoped(user, id);
  assertCanManage(user, task);

  const previousProject = task.project;
  const newlyAssigned = [];
  if (input.title !== undefined) task.title = input.title;
  if (input.instructions !== undefined) task.instructions = input.instructions;
  if (input.priority !== undefined) task.priority = input.priority;
  if (input.dueDate !== undefined) task.dueDate = input.dueDate ?? undefined;
  if (input.projectId !== undefined) task.project = await assertProject(input.projectId);
  if (input.assigneeIds !== undefined) {
    const next = await resolveAssignees(input.assigneeIds);
    const before = new Set(task.assignees.map(String));
    newlyAssigned.push(...next.filter((a) => !before.has(String(a))));
    task.assignees = next;
  }
  await task.save();

  await Promise.all([
    recalcProjectProgress(task.project),
    String(previousProject ?? "") !== String(task.project ?? "")
      ? recalcProjectProgress(previousProject)
      : null,
  ]);
  if (newlyAssigned.length) {
    await notify(newlyAssigned, {
      type: "task-assigned",
      title: "New task assigned",
      description: `${task.title} was assigned to you.`,
      category: "Mentor activity",
      accent: "blue",
      actionLabel: "View task",
      link: taskLink(task),
    });
  }
  return reload(task._id);
}

export async function remove(user, id) {
  const task = await findScoped(user, id);
  assertCanManage(user, task);
  await task.deleteOne();
  await recalcProjectProgress(task.project);
  await logActivity({ type: "task-deleted", title: `${task.title} deleted`, actor: user });
}

/* --------------------------------- steps ------------------------------ */

function findStep(task, stepId) {
  const step = task.steps.id(stepId);
  if (!step) throw ApiError.notFound("Step not found");
  return step;
}

export async function addStep(user, id, { text }) {
  const task = await findScoped(user, id);
  assertCanManage(user, task);
  task.steps.push({ text });
  await syncTask(task); // a finished task becomes "In progress" again
  return reload(id);
}

export async function updateStep(user, id, stepId, { text }) {
  const task = await findScoped(user, id);
  assertCanManage(user, task);
  const step = findStep(task, stepId);
  if (step.done) {
    throw ApiError.conflict("A step that was already completed cannot be edited", { code: "STEP_LOCKED" });
  }
  step.text = text;
  await task.save();
  return reload(id);
}

export async function removeStep(user, id, stepId) {
  const task = await findScoped(user, id);
  assertCanManage(user, task);
  const step = findStep(task, stepId);
  if (step.done) {
    throw ApiError.conflict("A step that was already completed cannot be removed", { code: "STEP_LOCKED" });
  }
  task.steps.pull(stepId);
  await syncTask(task);
  return reload(id);
}

/** Intern marks the current step as finished without attaching a submission. */
export async function completeStep(user, id, stepId) {
  if (user.role !== ROLES.INTERN) throw ApiError.forbidden("Only the assigned intern can complete a step");
  const task = await findScoped(user, id);
  const step = findStep(task, stepId);
  const index = task.steps.findIndex((s) => idOf(s) === idOf(step));
  if (stepStates(task.steps)[index] !== STEP_STATE.CURRENT) {
    throw ApiError.conflict("Finish the previous step first", { code: "STEP_NOT_AVAILABLE" });
  }
  step.done = true;
  step.approved = false;
  step.changesRequested = false;
  step.completedAt = new Date();
  await syncTask(task);

  const reviewers = await reviewerIdsFor(task.assignees, [task.createdBy]);
  await notify(reviewers, {
    type: "step-completed",
    title: "A step is waiting for review",
    description: `${user.name} finished "${step.text}" in ${task.title}.`,
    category: "Review queue",
    accent: "amber",
    actionLabel: "Review",
    link: "/mentor/tasks",
  });
  return reload(id);
}

/** Mentor/admin approves the step that is waiting for review, which unlocks the next one. */
export async function approveStep(user, id, stepId, { note }) {
  const task = await findScoped(user, id);
  assertCanManage(user, task);
  const step = findStep(task, stepId);
  if (!step.done || step.approved) {
    throw ApiError.conflict("This step is not waiting for review", { code: "STEP_NOT_IN_REVIEW" });
  }
  step.approved = true;
  step.changesRequested = false;
  step.reviewNote = note || undefined;
  step.approvedAt = new Date();
  step.approvedBy = user._id;
  await syncTask(task);

  const finished = task.status === TASK_STATUS.DONE;
  await notify(task.assignees, {
    type: "step-approved",
    title: finished ? "Task completed" : "Step approved",
    description: finished
      ? `${task.title} is complete. Great work!`
      : `"${step.text}" was approved. The next step is unlocked.`,
    category: "Mentor activity",
    accent: "emerald",
    actionLabel: "View task",
    link: taskLink(task),
  });
  await logActivity({
    type: "step-approved",
    title: `${step.text} approved`,
    detail: task.title,
    actor: user,
    task: task._id,
  });
  return reload(id);
}

/** Mentor/admin sends a finished step back; the intern has to redo it. */
export async function requestChanges(user, id, stepId, { note }) {
  const task = await findScoped(user, id);
  assertCanManage(user, task);
  const step = findStep(task, stepId);
  if (!step.done || step.approved) {
    throw ApiError.conflict("This step is not waiting for review", { code: "STEP_NOT_IN_REVIEW" });
  }
  step.done = false;
  step.approved = false;
  step.changesRequested = true;
  step.reviewNote = note;
  await syncTask(task);

  await notify(task.assignees, {
    type: "changes-requested",
    title: "Changes requested",
    description: `"${step.text}" needs another pass: ${note}`.slice(0, 480),
    category: "Mentor activity",
    accent: "rose",
    actionLabel: "View task",
    link: taskLink(task),
  });
  return reload(id);
}
