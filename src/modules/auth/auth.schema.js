import { z } from "zod";
import { REGISTERABLE_ROLES, ROLES } from "../../config/constants.js";
import { emailField, passwordField } from "../users/user.schema.js";

export const registerBody = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email: emailField,
  password: passwordField,
  role: z.enum(REGISTERABLE_ROLES).default(ROLES.INTERN),
});

export const loginBody = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password").max(200),
  remember: z.boolean().default(true),
});

export const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordField,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });
