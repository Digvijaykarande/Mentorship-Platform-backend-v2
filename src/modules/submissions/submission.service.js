import { ApiError } from "../../utils/ApiError.js";
import { ROLES, SUBMISSION_STATUS as S, FEEDBACK_STATUS } from "../../config/constants.js";
import { escapeRegex, skipOf } from "../../utils/pagination.js";
import { idOf } from "../../utils/serialize.js";
import { nextCode } from "../common/counter.model.js";
import { reviewerIdsFor, scopeFilter } from "../common/scope.js";
import { Task } from "../tasks/task.model.js";
import { syncTask, create as createTask } from "../tasks/task.service.js";
import { STEP_STATE, stepStates } from "../tasks/taskSteps.js";
import { Feedback } from "../feedback/feedback.model.js";
import { notify } from "../notifications/notification.service.js";
import { logActivity } from "../admin/activity.service.js";
import { Submission } from "./submission.model.js";
import { serializeSubmission } from "./submission.serializer.js";
import { INITIAL_VERSION, chooseVersion, diffEdit, isValidVersion, linkFieldFor, normalizeVersion } from "./versioning.js";

const POPULATE = [
  { path: "intern", select: "name code email role avatar" },
  { path: "project", select: "name code" },
  { path: "task", select: "title code steps" },
  { path: "reviewedBy", select: "name code email role avatar" },
  { path: "reviews.reviewer", select: "name code email role avatar" },
];

/* ------------------------------- helpers ------------------------------ */

async function findScoped(user, id) {
  const scope = await scopeFilter(user, "submissions");
  const submission = await Submission.findOne({ _id: id, ...scope });
  if (!submission) throw ApiError.notFound("Submission not found");
  return submission;
}

const reload = async (id) => serializeSubmission(await Submission.findById(id).populate(POPULATE).lean());

function assertOwner(user, submission) {
  if (user.role !== ROLES.INTERN || idOf(submission.intern) !== idOf(user)) {
    throw ApiError.forbidden("You can only change your own submissions", { code: "FORBIDDEN" });
  }
}

const norm = (v) => String(v ?? "").trim();

/** Copy the editable fields of the request onto the document. */
function applyContent(submission, input) {
  const oldField = linkFieldFor(submission.type);
  const newField = linkFieldFor(input.type);
  submission.title = norm(input.title) || submission.title;
  submission.type = input.type;
  submission.notes = norm(input.notes);
  submission.files = input.files;
  if (oldField !== newField) submission[oldField] = "";
  submission[newField] = norm(input.link);
}

const currentLinkOf = (submission) => submission[linkFieldFor(submission.type)] ?? "";

/* ----------------- keeping the linked task step in sync --------------- */

function markStepFor(step, submissionId, status, feedback) {
  step.submission = submissionId;
  if (status === S.APPROVED) {
    step.done = true;
    step.approved = true;
    step.changesRequested = false;
    step.reviewNote = feedback || undefined;
    step.approvedAt = step.approvedAt ?? new Date();
  } else if (status === S.CHANGES_REQUESTED) {
    step.done = false;
    step.approved = false;
    step.changesRequested = true;
    step.reviewNote = feedback || undefined;
  } else {
    // Pending: finished by the intern, waiting for a mentor.
    step.done = true;
    step.approved = false;
    step.changesRequested = false;
    step.reviewNote = undefined;
    step.completedAt = new Date();
  }
}

function clearStep(step) {
  step.done = false;
  step.approved = false;
  step.changesRequested = false;
  step.reviewNote = undefined;
  step.submission = undefined;
  step.completedAt = undefined;
  step.approvedAt = undefined;
}

/** Run `change(step, task)` on the step this submission is linked to, then re-derive the task. */
async function withLinkedStep(submission, change) {
  if (!submission.task || !submission.stepId) return;
  const task = await Task.findById(submission.task);
  const step = task?.steps.id(submission.stepId);
  if (!step) return;
  change(step, task);
  await syncTask(task);
}

/* -------------------------------- queries ----------------------------- */

export async function list(user, query) {
  const filter = { ...(await scopeFilter(user, "submissions")) };
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.intern) filter.intern = query.intern;
  if (query.task) filter.task = query.task;
  if (query.search) filter.title = { $regex: escapeRegex(query.search), $options: "i" };
  const [items, total] = await Promise.all([
    Submission.find(filter)
      .sort({ createdAt: -1 })
      .skip(skipOf(query))
      .limit(query.limit)
      .populate(POPULATE)
      .lean(),
    Submission.countDocuments(filter),
  ]);
  return { items: items.map(serializeSubmission), total };
}

export async function getById(user, id) {
  await findScoped(user, id);
  return reload(id);
}

/* ------------------------------ intern actions ------------------------ */

export async function create(user, input) {
  if (user.role !== ROLES.INTERN) throw ApiError.forbidden("Only interns submit work");

  let task = null;
  let step = null;
  if (input.taskId) {
    const scope = await scopeFilter(user, "tasks");
    task = await Task.findOne({ _id: input.taskId, ...scope });
    if (!task) throw ApiError.unprocessable("Task not found", { code: "INVALID_TASK" });
    const states = stepStates(task.steps);
    const wanted = input.stepId ? task.steps.findIndex((s) => idOf(s) === input.stepId) : -1;
    const index = wanted >= 0 && states[wanted] === STEP_STATE.CURRENT ? wanted : states.indexOf(STEP_STATE.CURRENT);
    step = index >= 0 ? task.steps[index] : null;

    if (step?.submission) {
      const previous = await Submission.findById(step.submission).select("status");
      if (previous?.status === S.CHANGES_REQUESTED) {
        throw ApiError.conflict("Your mentor asked for changes on this step. Revise that submission instead.", {
          code: "REVISE_EXISTING",
        });
      }
    }
  }

  const version = isValidVersion(input.version) ? normalizeVersion(input.version) : INITIAL_VERSION;
  const submission = new Submission({
    code: await nextCode("submission", "SUB"),
    title: norm(input.title) || "New Work Submission",
    type: input.type,
    status: S.PENDING,
    version,
    intern: user._id,
    project: task?.project,
    task: task?._id,
    stepId: step?._id,
    description: "New work submitted for mentor review.",
    feedback: "Waiting for mentor feedback.",
    notes: norm(input.notes),
    files: input.files,
    versions: [{ version, status: S.PENDING, kind: "initial", changes: "Initial submission." }],
  });
  submission[linkFieldFor(input.type)] = norm(input.link);
  await submission.save();

  if (step) {
    markStepFor(step, submission._id, S.PENDING);
    await syncTask(task);
  }

  const reviewers = await reviewerIdsFor([user._id], [task?.createdBy]);
  await notify(reviewers, {
    type: "submission-received",
    title: "New submission to review",
    description: `${user.name} submitted "${submission.title}" (${submission.version}).`,
    category: "Review queue",
    accent: "amber",
    actionLabel: "Review",
    link: "/mentor/submissions",
  });
  await logActivity({
    type: "submission-received",
    title: `${submission.title} submitted`,
    detail: `${user.name} · ${submission.version}`,
    actor: user,
    submission: submission._id,
    task: task?._id,
  });
  return { submission: await reload(submission._id), changed: true };
}

/** Edit a pending submission. Nothing changed -> `changed: false` and no new version. */
export async function edit(user, id, input) {
  const submission = await findScoped(user, id);
  assertOwner(user, submission);
  if (submission.status !== S.PENDING) {
    throw ApiError.conflict("Only submissions waiting for review can be edited", { code: "NOT_EDITABLE" });
  }

  // A submission linked to a step keeps its task; an unlinked one may be attached to a task.
  const taskId = submission.stepId ? idOf(submission.task) : input.taskId ?? idOf(submission.task);
  const before = {
    type: submission.type,
    link: currentLinkOf(submission),
    files: submission.files.map((f) => ({ name: f.name, url: f.url })),
    title: submission.title,
    notes: submission.notes,
    taskId: idOf(submission.task),
  };
  const after = { ...input, taskId, files: input.files.map((f) => ({ name: f.name, url: f.url })) };
  const { kind, changed } = diffEdit(before, after);
  if (!kind) return { submission: await reload(id), changed: false };

  if (taskId !== idOf(submission.task)) {
    const scope = await scopeFilter(user, "tasks");
    const task = taskId ? await Task.findOne({ _id: taskId, ...scope }) : null;
    if (taskId && !task) throw ApiError.unprocessable("Task not found", { code: "INVALID_TASK" });
    submission.task = task?._id;
    submission.project = task?.project;
  }
  applyContent(submission, input);
  const version = chooseVersion(input.version, submission.version, kind);
  submission.version = version;
  submission.versions.unshift({
    version,
    status: S.PENDING,
    kind,
    changes: norm(input.changeNote) || `Updated ${changed.join(", ")}.`,
  });
  await submission.save();
  return { submission: await reload(id), changed: true };
}

/** Re-submit after the mentor asked for changes: a new major version, back to Pending. */
export async function revise(user, id, input) {
  const submission = await findScoped(user, id);
  assertOwner(user, submission);
  if (submission.status !== S.CHANGES_REQUESTED) {
    throw ApiError.conflict("Only submissions with requested changes can be revised", { code: "NOT_REVISABLE" });
  }
  applyContent(submission, input);
  const version = chooseVersion(input.version, submission.version, "major");
  submission.version = version;
  submission.status = S.PENDING;
  submission.feedback = "Your revised submission is waiting for mentor review.";
  submission.versions.unshift({
    version,
    status: S.PENDING,
    kind: "major",
    changes: norm(input.changeNote) || "Revision submitted for mentor review.",
  });
  await submission.save();
  await withLinkedStep(submission, (step) => markStepFor(step, submission._id, S.PENDING));

  const task = submission.task ? await Task.findById(submission.task).select("createdBy") : null;
  const reviewers = await reviewerIdsFor([user._id], [task?.createdBy]);
  await notify(reviewers, {
    type: "submission-revised",
    title: "Revision to review",
    description: `${user.name} sent ${submission.version} of "${submission.title}".`,
    category: "Review queue",
    accent: "amber",
    actionLabel: "Review",
    link: "/mentor/submissions",
  });
  return { submission: await reload(id), changed: true };
}

export async function withdraw(user, id) {
  const submission = await findScoped(user, id);
  assertOwner(user, submission);
  if (![S.PENDING, S.CHANGES_REQUESTED].includes(submission.status)) {
    throw ApiError.conflict("This submission cannot be withdrawn", { code: "NOT_WITHDRAWABLE" });
  }
  submission.prevStatus = submission.status;
  submission.prevFeedback = submission.feedback;
  submission.status = S.WITHDRAWN;
  submission.feedback = "This submission was withdrawn by you.";
  if (submission.versions[0]) submission.versions[0].status = S.WITHDRAWN;
  await submission.save();
  await withLinkedStep(submission, (step) => {
    if (idOf(step.submission) === idOf(submission)) clearStep(step);
  });
  return reload(id);
}

export async function restore(user, id) {
  const submission = await findScoped(user, id);
  assertOwner(user, submission);
  if (submission.status !== S.WITHDRAWN) {
    throw ApiError.conflict("Only withdrawn submissions can be restored", { code: "NOT_RESTORABLE" });
  }
  const status = submission.prevStatus && submission.prevStatus !== S.WITHDRAWN ? submission.prevStatus : S.PENDING;

  if (submission.task && submission.stepId) {
    const task = await Task.findById(submission.task);
    const step = task?.steps.id(submission.stepId);
    // The step must still be free; another submission may have taken it while this one was withdrawn.
    if (step && (step.submission || step.done)) {
      throw ApiError.conflict("Another submission is already linked to this step", { code: "STEP_TAKEN" });
    }
  }
  submission.status = status;
  submission.feedback = submission.prevFeedback || "Waiting for mentor feedback.";
  submission.prevStatus = undefined;
  submission.prevFeedback = undefined;
  if (submission.versions[0]) submission.versions[0].status = status;
  await submission.save();
  await withLinkedStep(submission, (step) => markStepFor(step, submission._id, status, submission.feedback));
  return reload(id);
}

export async function remove(user, id) {
  const submission = await findScoped(user, id);
  assertOwner(user, submission);
  if (submission.status === S.APPROVED) {
    throw ApiError.conflict("Approved submissions are locked and cannot be deleted", { code: "LOCKED" });
  }
  await withLinkedStep(submission, (step) => {
    if (idOf(step.submission) === idOf(submission)) clearStep(step);
  });
  await submission.deleteOne();
}

/* ----------------------------- mentor review -------------------------- */

export async function review(user, id, input) {
  if (user.role === ROLES.INTERN) throw ApiError.forbidden("Only mentors and admins can review work");
  const submission = await findScoped(user, id);
  if (submission.status !== S.PENDING) {
    throw ApiError.conflict("Only submissions waiting for review can be reviewed", { code: "NOT_PENDING" });
  }

  const approve = input.decision === "approve";
  const status = approve ? S.APPROVED : S.CHANGES_REQUESTED;
  const note = norm(input.note) || (approve ? "Approved. Great work." : "Please review the notes and resubmit.");
  const rating = input.rating ?? (approve ? 5 : 3.5);

  submission.status = status;
  submission.feedback = note;
  submission.reviewedAt = new Date();
  submission.reviewedBy = user._id;
  submission.reviews.unshift({ status, note, rating, reviewer: user._id });
  if (submission.versions[0]) submission.versions[0].status = status;
  await submission.save();
  await withLinkedStep(submission, (step, task) => {
    markStepFor(step, submission._id, status, note);
    if (approve) step.approvedBy = user._id;
    return task;
  });

  // One feedback record per submission; reviewing again updates it.
  const strengths = input.strengths.length
    ? input.strengths
    : approve
      ? ["Deliverable reviewed against the assignment brief."]
      : [];
  const improvements = input.improvements.length ? input.improvements : approve ? [] : [note];
  const task = submission.task ? await Task.findById(submission.task).select("project") : null;
  const feedbackStatus = approve ? FEEDBACK_STATUS.RESOLVED : FEEDBACK_STATUS.ACTION_REQUIRED;
  const existing = await Feedback.findOne({ submission: submission._id });
  if (existing) {
    Object.assign(existing, { status: feedbackStatus, summary: note, rating, strengths, improvements, mentor: user._id });
    await existing.save();
  } else {
    await Feedback.create({
      code: await nextCode("feedback", "FB"),
      title: submission.title,
      category: "Delivery review",
      status: feedbackStatus,
      rating,
      mentor: user._id,
      mentee: submission.intern,
      project: task?.project ?? submission.project,
      task: submission.task,
      submission: submission._id,
      summary: note,
      strengths,
      improvements,
    });
  }

  let nextTask = null;
  if (input.nextTask) {
    nextTask = await createTask(user, {
      title: input.nextTask.title,
      projectId: idOf(task?.project ?? submission.project),
      assigneeIds: [idOf(submission.intern)],
      instructions: input.nextTask.instructions,
      priority: input.nextTask.priority,
      dueDate: input.nextTask.dueDate ?? null,
      steps: input.nextTask.steps,
    });
  }

  await notify(submission.intern, {
    type: approve ? "submission-approved" : "revision-requested",
    title: approve ? "Submission approved" : "Changes requested",
    description: approve
      ? `"${submission.title}" was approved by ${user.name}.`
      : `${user.name} asked for changes on "${submission.title}".`,
    category: "Assessment",
    accent: approve ? "emerald" : "rose",
    actionLabel: approve ? "View feedback" : "Revise",
    link: approve
      ? "/dashboard/feedback"
      : `/dashboard/submit-work?submission=${idOf(submission)}&action=revise`,
  });
  await logActivity({
    type: approve ? "submission-approved" : "revision-requested",
    title: `${submission.title} ${approve ? "approved" : "sent back for revision"}`,
    detail: `${user.name}${nextTask ? ` · next task: ${nextTask.title}` : ""}`,
    actor: user,
    submission: submission._id,
    task: submission.task,
  });
  return { submission: await reload(id), nextTask };
}
