import { z } from "zod";
import { ROLES, USER_STATUS_VALUES } from "../../config/constants.js";
import { objectId } from "../../utils/objectId.js";
import { paginationShape } from "../../utils/pagination.js";
import { text } from "../../utils/zodFields.js";
import { emailField, passwordField } from "./user.schema.js";

export const listUsersQuery = z.object({
  ...paginationShape,
  role: z.enum([ROLES.INTERN, ROLES.MENTOR, ROLES.ADMIN]).optional(),
  status: z.enum(USER_STATUS_VALUES).optional(),
  search: text(100).optional(),
});

export const createUserBody = z.object({
  name: text(120).min(2, "Enter the full name"),
  email: emailField,
  password: passwordField,
  role: z.enum([ROLES.INTERN, ROLES.MENTOR]),
  team: text(80).optional(),
  cohort: text(60).optional(),
  mentorId: objectId.nullable().optional(),
  specialty: text(120).optional(),
  capacity: z.number().int().min(0).max(100).optional(),
});

export const updateUserBody = z.object({
  name: text(120).min(2).optional(),
  team: text(80).optional(),
  cohort: text(60).optional(),
  mentorId: objectId.nullable().optional(),
  specialty: text(120).optional(),
  capacity: z.number().int().min(0).max(100).optional(),
  status: z.enum(USER_STATUS_VALUES).optional(),
  isActive: z.boolean().optional(),
  isApproved: z.boolean().optional(),
});

export const resetPasswordBody = z.object({ newPassword: passwordField });
