import { z } from "zod";
import { FEEDBACK_STATUS_VALUES } from "../../config/constants.js";
import { objectId } from "../../utils/objectId.js";
import { paginationShape } from "../../utils/pagination.js";
import { text } from "../../utils/zodFields.js";

const lines = z.array(text(500).min(1)).max(10).default([]);

export const listFeedbackQuery = z.object({
  ...paginationShape,
  status: z.enum(FEEDBACK_STATUS_VALUES).optional(),
  mentee: objectId.optional(),
  search: text(100).optional(),
});

export const giveFeedbackBody = z.object({
  menteeId: objectId,
  mentorId: objectId.optional(), // admins may attribute feedback to a mentor; mentors always give their own
  title: text(200).min(2, "Enter a title"),
  category: text(60).default("General Review"),
  status: z.enum(FEEDBACK_STATUS_VALUES).default("Resolved"),
  rating: z.number().min(0).max(5).optional(),
  summary: text(2000).default(""),
  strengths: lines,
  improvements: lines,
  projectId: objectId.nullable().optional(),
  taskId: objectId.nullable().optional(),
});

export const requestFeedbackBody = z.object({
  mentorId: objectId,
  subject: text(200).min(2, "Enter a subject"),
  message: text(2000).default(""),
  projectId: objectId.nullable().optional(),
  taskId: objectId.nullable().optional(),
});

export const respondBody = z.object({
  status: z.enum(FEEDBACK_STATUS_VALUES).default("Resolved"),
  rating: z.number().min(0).max(5).optional(),
  summary: text(2000).optional(),
  strengths: lines,
  improvements: lines,
});

export const statusBody = z.object({ status: z.enum(FEEDBACK_STATUS_VALUES) });

export const feedbackParams = z.object({ id: objectId });
export const suggestionParams = z.object({
  id: objectId,
  index: z.coerce.number().int().min(0).max(9),
});
