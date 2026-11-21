import { ApiError } from "../../utils/ApiError.js";
import { PROJECT_STATUS, ROLES, TASK_STATUS } from "../../config/constants.js";
import { escapeRegex, skipOf } from "../../utils/pagination.js";
import { idOf, iso } from "../../utils/serialize.js";
import { nextCode } from "../common/counter.model.js";
import { reviewerIdsFor, scopeFilter } from "../common/scope.js";
import { User } from "../users/user.model.js";
import { Task } from "../tasks/task.model.js";
import { Feedback } from "../feedback/feedback.model.js";
import { notify } from "../notifications/notification.service.js";
import { logActivity } from "../admin/activity.service.js";
import { Project } from "./project.model.js";
import { Meeting } from "./meeting.model.js";
import { serializeMeeting, serializeProject } from "./project.serializer.js";

const POPULATE = [
  { path: "owner", select: "name code email role avatar" },
  { path: "mentor", select: "name code email role avatar" },
  { path: "assignees", select: "name code email role avatar" },
  { path: "resources.uploadedBy", select: "name code email role avatar" },
  { path: "documentation.sections.addedBy", select: "name code email role avatar" },
];

/* ------------------------------- helpers ------------------------------ */

async function findScoped(user, id) {
  const scope = await scopeFilter(user, "projects");
  const project = await Project.findOne({ _id: id, ...scope });
  if (!project) throw ApiError.notFound("Project not found");
  return project;
}

function assertStaff(user) {
  if (user.role === ROLES.INTERN) {
    throw ApiError.forbidden("Only mentors and admins can manage projects", { code: "FORBIDDEN" });
  }
}

async function activeUsers(ids, role) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const found = await User.find({ _id: { $in: unique }, role, isActive: true }).select("_id");
  if (found.length !== unique.length) {
    throw ApiError.unprocessable(`One or more selected ${role}s are not available`, {
      code: "INVALID_USERS",
    });
  }
  return found.map((u) => u._id);
}

/** Latest answered feedback + task counts for a batch of projects, in two queries. */
async function decorate(projects) {
  const ids = projects.map((p) => p._id);
  const [feedback, tasks] = await Promise.all([
    Feedback.find({ project: { $in: ids }, isRequest: false })
      .sort({ createdAt: -1 })
      .populate("mentor", "name")
      .lean(),
    Task.find({ project: { $in: ids } }).select("project status").lean(),
  ]);
  const latest = new Map();
  for (const fb of feedback) {
    const key = String(fb.project);
    if (!latest.has(key) && fb.summary) {
      latest.set(key, { quote: fb.summary, mentor: fb.mentor?.name ?? "", createdAt: iso(fb.createdAt) });
    }
  }
  const counts = new Map();
  for (const t of tasks) {
    const c = counts.get(String(t.project)) ?? { total: 0, open: 0 };
    c.total += 1;
    if (t.status !== TASK_STATUS.DONE) c.open += 1;
    counts.set(String(t.project), c);
  }
  return projects.map((p) =>
    serializeProject(p, {
      latestFeedback: latest.get(String(p._id)) ?? null,
      taskCount: counts.get(String(p._id))?.total ?? 0,
      openTaskCount: counts.get(String(p._id))?.open ?? 0,
    }),
  );
}

const reloadOne = async (id) => {
  const project = await Project.findById(id).populate(POPULATE).lean();
  return (await decorate([project]))[0];
};

/* -------------------------------- queries ----------------------------- */

export async function list(user, query) {
  const filter = { ...(await scopeFilter(user, "projects")) };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$and = [{ $or: [{ name: rx }, { description: rx }, { tags: rx }] }];
  }
  const [items, total] = await Promise.all([
    Project.find(filter).sort({ createdAt: -1 }).skip(skipOf(query)).limit(query.limit).populate(POPULATE).lean(),
    Project.countDocuments(filter),
  ]);
  return { items: await decorate(items), total };
}

export async function getById(user, id) {
  await findScoped(user, id);
  return reloadOne(id);
}

/* ------------------------------- mutations ---------------------------- */

export async function create(user, input) {
  assertStaff(user);
  const assignees = await activeUsers(input.assigneeIds, ROLES.INTERN);
  const mentorId = input.mentorId ?? (user.role === ROLES.MENTOR ? user._id : undefined);
  const [mentor] = mentorId ? await activeUsers([mentorId], ROLES.MENTOR) : [];
  const [owner] = input.ownerId ? await activeUsers([input.ownerId], ROLES.INTERN) : [];

  const project = await Project.create({
    code: await nextCode("project", "PRJ"),
    name: input.name,
    description: input.description,
    ...(input.cohort && { cohort: input.cohort }),
    status: input.status,
    priority: input.priority,
    dueDate: input.dueDate ?? undefined,
    owner: owner ?? assignees[0],
    mentor,
    assignees,
    tags: input.tags,
    ...(input.icon && { icon: input.icon }),
    repo: { path: input.repoPath, ...(input.branch && { branch: input.branch }) },
    roadmap: input.roadmap ?? [],
    documentation: {
      version: input.documentation?.version ?? "v1.0",
      updatedAt: input.documentation ? new Date() : undefined,
      sections: input.documentation?.sections ?? [],
    },
    resources: [...(input.resources ?? []), ...(input.resource ? [input.resource] : [])].map((r) => ({
      ...r,
      uploadedBy: user._id,
    })),
    createdBy: user._id,
  });

  await notify(assignees, {
    type: "project-assigned",
    title: "New project assigned",
    description: `You were added to ${project.name}.`,
    category: "Mentor activity",
    accent: "violet",
    actionLabel: "Open project",
    link: "/dashboard/my-projects",
  });
  await logActivity({
    type: "project-created",
    title: `${project.name} created`,
    detail: `${assignees.length} intern${assignees.length === 1 ? "" : "s"}`,
    actor: user,
    project: project._id,
  });
  return reloadOne(project._id);
}

export async function update(user, id, input) {
  assertStaff(user);
  const project = await findScoped(user, id);
  const added = [];

  for (const key of ["name", "description", "cohort", "status", "priority", "icon", "tags", "roadmap"]) {
    if (input[key] !== undefined) project[key] = input[key];
  }
  if (input.dueDate !== undefined) project.dueDate = input.dueDate ?? undefined;
  if (input.repoPath !== undefined) project.repo.path = input.repoPath;
  if (input.branch !== undefined) project.repo.branch = input.branch;
  if (input.documentation) {
    if (input.documentation.version) project.documentation.version = input.documentation.version;
    project.documentation.sections = input.documentation.sections;
    project.documentation.updatedAt = new Date();
  }
  if (input.mentorId !== undefined) {
    const [mentor] = input.mentorId ? await activeUsers([input.mentorId], ROLES.MENTOR) : [];
    project.mentor = mentor;
  }
  if (input.ownerId !== undefined) {
    const [owner] = input.ownerId ? await activeUsers([input.ownerId], ROLES.INTERN) : [];
    project.owner = owner;
  }
  if (input.assigneeIds !== undefined) {
    const next = await activeUsers(input.assigneeIds, ROLES.INTERN);
    const before = new Set(project.assignees.map(String));
    added.push(...next.filter((a) => !before.has(String(a))));
    project.assignees = next;
  }
  await project.save();

  if (added.length) {
    await notify(added, {
      type: "project-assigned",
      title: "New project assigned",
      description: `You were added to ${project.name}.`,
      category: "Mentor activity",
      accent: "violet",
      actionLabel: "Open project",
      link: "/dashboard/my-projects",
    });
  }
  return reloadOne(id);
}

/** Deleting a project keeps its tasks and submissions (they just lose the project label). */
export async function remove(user, id) {
  assertStaff(user);
  const project = await findScoped(user, id);
  await Task.updateMany({ project: project._id }, { $unset: { project: 1 } });
  await project.deleteOne();
  await logActivity({ type: "project-deleted", title: `${project.name} deleted`, actor: user });
}

/* ---------------------- intern actions on a project ------------------- */

function assertAssignedIntern(user, project) {
  const assigned = project.assignees.some((a) => idOf(a) === idOf(user));
  if (user.role !== ROLES.INTERN || !assigned) {
    throw ApiError.forbidden("Only interns on this project can do this", { code: "FORBIDDEN" });
  }
}

export async function requestReview(user, id, { note }) {
  const project = await findScoped(user, id);
  assertAssignedIntern(user, project);

  project.reviewRequests.push({ by: user._id, mentor: project.mentor, note });
  if (project.status === PROJECT_STATUS.IN_PROGRESS) project.status = PROJECT_STATUS.UNDER_REVIEW;
  await project.save();

  const reviewers = await reviewerIdsFor([user._id], [project.mentor]);
  await notify(reviewers, {
    type: "review-requested",
    title: "Project review requested",
    description: `${user.name} asked for a review of ${project.name}.`,
    category: "Review queue",
    accent: "amber",
    actionLabel: "Open",
    link: "/mentor/projects",
  });
  await logActivity({
    type: "review-requested",
    title: `Review requested: ${project.name}`,
    detail: user.name,
    actor: user,
    project: project._id,
  });
  return reloadOne(id);
}

export async function scheduleMeeting(user, id, { date, timeSlot, agenda }) {
  const project = await findScoped(user, id);
  assertAssignedIntern(user, project);

  const [mentorId] = project.mentor ? [project.mentor] : await reviewerIdsFor([user._id]);
  if (!mentorId) {
    throw ApiError.unprocessable("No mentor is assigned to this project yet", { code: "NO_MENTOR" });
  }
  const meeting = await Meeting.create({
    project: project._id,
    intern: user._id,
    mentor: mentorId,
    date,
    timeSlot,
    agenda,
  });
  await notify(mentorId, {
    type: "meeting-requested",
    title: "1-on-1 requested",
    description: `${user.name} asked for ${timeSlot} on ${date.toDateString()}.`,
    category: "Meetings",
    accent: "sky",
    actionLabel: "Open",
    link: "/mentor/projects",
  });
  return serializeMeeting(meeting);
}

/* ------------------------------- resources ---------------------------- */

export async function addResource(user, id, input) {
  const project = await findScoped(user, id);
  if (user.role === ROLES.INTERN) assertAssignedIntern(user, project);
  project.resources.unshift({ ...input, uploadedBy: user._id });
  await project.save();
  return reloadOne(id);
}

export async function removeResource(user, id, resourceId) {
  const project = await findScoped(user, id);
  const resource = project.resources.id(resourceId);
  if (!resource) throw ApiError.notFound("Resource not found");
  if (user.role === ROLES.INTERN && idOf(resource.uploadedBy) !== idOf(user)) {
    throw ApiError.forbidden("You can only remove files you added", { code: "FORBIDDEN" });
  }
  project.resources.pull(resourceId);
  await project.save();
  return reloadOne(id);
}

/* ----------------------------- documentation -------------------------- */

const paragraphsOf = (notes) =>
  notes
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Mentors / admins share a documentation entry (notes + files + links) with every intern on the project. */
export async function addDocumentation(user, id, { title, notes, attachments }) {
  assertStaff(user);
  const project = await findScoped(user, id);
  project.documentation.sections.push({
    key: `doc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title,
    type: "text",
    content: paragraphsOf(notes),
    attachments,
    addedBy: user._id,
    addedAt: new Date(),
  });
  project.documentation.updatedAt = new Date();
  await project.save();

  await notify(project.assignees, {
    type: "documentation-shared",
    title: "New project documentation",
    description: `${user.name} shared "${title}" on ${project.name}.`,
    category: "Mentor activity",
    accent: "sky",
    actionLabel: "Open project",
    link: "/dashboard/my-projects",
  });
  return reloadOne(id);
}

export async function removeDocumentation(user, id, key) {
  assertStaff(user);
  const project = await findScoped(user, id);
  const index = project.documentation.sections.findIndex((s) => s.key === key);
  if (index < 0) throw ApiError.notFound("Documentation not found");
  project.documentation.sections.splice(index, 1);
  project.documentation.updatedAt = new Date();
  await project.save();
  return reloadOne(id);
}
