import { z } from "zod";
import { PRIORITY_VALUES, PROJECT_STATUS_VALUES, ROADMAP_STATUS_VALUES } from "../../config/constants.js";
import { objectId } from "../../utils/objectId.js";
import { paginationShape } from "../../utils/pagination.js";
import { attachmentInput, dateField, linkField, optionalDate, text } from "../../utils/zodFields.js";

const roadmapPhase = z.object({
  title: text(160).min(1),
  status: z.enum(ROADMAP_STATUS_VALUES).default("upcoming"),
  dateLabel: text(60).optional(),
  description: text(600).optional(),
});

const docSection = z.object({
  key: text(60).min(1),
  title: text(120).min(1),
  type: z.enum(["text", "list", "checklist", "steps", "points", "groups"]).default("text"),
  content: z.any().default([]),
  attachments: z.array(attachmentInput).max(10).optional(),
});

const resourceInput = z.object({
  name: text(160).min(1, "Enter a name"),
  category: text(60).optional(),
  url: linkField.optional(),
  publicId: text(300).optional(),
  size: z.number().int().min(0).optional(),
  mimeType: text(100).optional(),
});

const projectFields = {
  name: text(160).min(2, "Enter a project name"),
  description: text(2000),
  cohort: text(60),
  status: z.enum(PROJECT_STATUS_VALUES),
  priority: z.enum(PRIORITY_VALUES),
  dueDate: optionalDate,
  ownerId: objectId.nullable(),
  mentorId: objectId.nullable(),
  assigneeIds: z.array(objectId).max(50),
  tags: z.array(text(40).min(1)).max(20),
  icon: text(40),
  repoPath: text(200),
  branch: text(80),
  roadmap: z.array(roadmapPhase).max(20),
  documentation: z.object({ version: text(20).optional(), sections: z.array(docSection).max(30) }),
};

export const createProjectBody = z.object({
  name: projectFields.name,
  description: projectFields.description.default(""),
  cohort: projectFields.cohort.optional(),
  status: projectFields.status.default("In Progress"),
  priority: projectFields.priority.default("Medium"),
  dueDate: optionalDate,
  ownerId: projectFields.ownerId.optional(),
  mentorId: projectFields.mentorId.optional(),
  assigneeIds: projectFields.assigneeIds.default([]),
  tags: projectFields.tags.default([]),
  icon: projectFields.icon.optional(),
  repoPath: projectFields.repoPath.optional(),
  branch: projectFields.branch.optional(),
  roadmap: projectFields.roadmap.optional(),
  documentation: projectFields.documentation.optional(),
  resource: resourceInput.optional(),
  resources: z.array(resourceInput).max(10).optional(),
});

export const updateProjectBody = z.object(
  Object.fromEntries(Object.entries(projectFields).map(([k, v]) => [k, v.optional()])),
);

export const listProjectsQuery = z.object({
  ...paginationShape,
  status: z.enum(PROJECT_STATUS_VALUES).optional(),
  search: text(100).optional(),
});

export const requestReviewBody = z.object({ note: text(1000).min(3, "Add a short note for your mentor") });
export const meetingBody = z.object({
  date: dateField,
  timeSlot: text(40).min(1, "Pick a time slot"),
  agenda: text(1000).default(""),
});
export const resourceBody = resourceInput;

/** A documentation entry the mentor shares with the whole project: notes and/or files and links. */
export const documentationBody = z
  .object({
    title: text(120).min(1, "Give the document a title"),
    notes: text(8000).default(""),
    attachments: z.array(attachmentInput).max(10).default([]),
  })
  .refine((v) => v.notes !== "" || v.attachments.length > 0, {
    message: "Write some notes or attach a file or link",
    path: ["notes"],
  });
export const documentationParams = z.object({ id: objectId, key: text(60).min(1) });

export const projectParams = z.object({ id: objectId });
export const resourceParams = z.object({ id: objectId, resourceId: objectId });
