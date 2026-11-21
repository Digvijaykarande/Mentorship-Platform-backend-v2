import { z } from "zod";
import { SUBMISSION_TYPE_VALUES, PRIORITY_VALUES, SUBMISSION_STATUS_VALUES } from "../../config/constants.js";
import { objectId } from "../../utils/objectId.js";
import { paginationShape } from "../../utils/pagination.js";
import { linkField, optionalDate, text } from "../../utils/zodFields.js";

const fileInput = z.object({
  name: text(200).min(1),
  url: linkField.min(1, "File url is missing"),
  publicId: text(300).optional(),
  size: z.number().int().min(0).optional(),
  mimeType: text(100).optional(),
});

const content = {
  title: text(200).default(""),
  type: z.enum(SUBMISSION_TYPE_VALUES),
  link: linkField.default(""),
  notes: text(2000).default(""),
  files: z.array(fileInput).max(10).default([]),
  version: text(20).optional(), // a version the intern picked; ignored unless newer than the current one
  changeNote: text(500).optional(),
};

const needsWork = (v) => v.files.length > 0 || v.link !== "";
const needsWorkMessage = { message: "Attach a file or add a link", path: ["link"] };

export const createSubmissionBody = z
  .object({
    ...content,
    taskId: objectId.nullable().optional(),
    stepId: objectId.nullable().optional(), // preferred step; only used if it is the current one
  })
  .refine(needsWork, needsWorkMessage);

export const editSubmissionBody = z
  .object({ ...content, taskId: objectId.nullable().optional() })
  .refine(needsWork, needsWorkMessage);

export const reviseSubmissionBody = z.object(content).refine(needsWork, needsWorkMessage);

export const reviewSubmissionBody = z
  .object({
    decision: z.enum(["approve", "changes"]),
    note: text(2000).default(""),
    rating: z.number().min(0).max(5).optional(),
    strengths: z.array(text(500).min(1)).max(10).default([]),
    improvements: z.array(text(500).min(1)).max(10).default([]),
    nextTask: z
      .object({
        title: text(200).min(2),
        instructions: text(4000).default(""),
        priority: z.enum(PRIORITY_VALUES).default("Medium"),
        dueDate: optionalDate,
        steps: z.array(text(300).min(1)).max(50).default([]),
      })
      .optional(),
  })
  .refine((v) => v.decision === "approve" || v.note.length >= 3, {
    message: "Tell the intern what needs to change",
    path: ["note"],
  });

export const listSubmissionsQuery = z.object({
  ...paginationShape,
  status: z.enum(SUBMISSION_STATUS_VALUES).optional(),
  type: z.enum(SUBMISSION_TYPE_VALUES).optional(),
  intern: objectId.optional(),
  task: objectId.optional(),
  search: text(100).optional(),
});

export const submissionParams = z.object({ id: objectId });
