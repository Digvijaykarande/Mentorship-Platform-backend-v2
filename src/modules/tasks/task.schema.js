import { z } from "zod";
import { PRIORITY_VALUES, TASK_STATUS_VALUES } from "../../config/constants.js";
import { objectId } from "../../utils/objectId.js";
import { paginationShape } from "../../utils/pagination.js";
import { linkField, optionalDate, text } from "../../utils/zodFields.js";

const resourceInput = z.object({
  name: text(160).min(1),
  url: linkField,
  type: text(60).optional(),
  publicId: text(300).optional(),
  size: z.number().int().min(0).optional(),
  mimeType: text(100).optional(),
});

export const listTasksQuery = z.object({
  ...paginationShape,
  status: z.enum(TASK_STATUS_VALUES).optional(),
  project: objectId.optional(),
  assignee: objectId.optional(),
  search: text(100).optional(),
});

export const createTaskBody = z.object({
  title: text(200).min(2, "Enter a task title"),
  projectId: objectId.nullable().optional(),
  assigneeIds: z.array(objectId).min(1, "Assign the task to at least one intern").max(20),
  instructions: text(4000).default(""),
  priority: z.enum(PRIORITY_VALUES).default("Medium"),
  dueDate: optionalDate,
  steps: z.array(text(300).min(1)).max(50).default([]),
  resource: resourceInput.optional(),
  resources: z.array(resourceInput).max(10).optional(),
});

export const updateTaskBody = z.object({
  title: text(200).min(2).optional(),
  projectId: objectId.nullable().optional(),
  assigneeIds: z.array(objectId).min(1).max(20).optional(),
  instructions: text(4000).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  dueDate: optionalDate,
});

export const stepBody = z.object({ text: text(300).min(1, "Enter the step text") });
export const reviewNoteBody = z.object({ note: text(1000).default("") });
export const requestChangesBody = z.object({
  note: text(1000).min(3, "Tell the intern what needs to change"),
});

export const taskParams = z.object({ id: objectId });
export const stepParams = z.object({ id: objectId, stepId: objectId });
