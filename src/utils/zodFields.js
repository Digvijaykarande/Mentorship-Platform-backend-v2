import { z } from "zod";

export const text = (max) => z.string().trim().max(max);

/** "2026-11-30" (or any ISO date string) -> Date. Rejects garbage instead of storing Invalid Date. */
export const dateField = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date")
  .transform((v) => new Date(v));

export const optionalDate = dateField.or(z.literal("").transform(() => null)).nullable().optional();

export const linkField = z
  .string()
  .trim()
  .max(600)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Links must start with http:// or https://");

/** A file (uploaded to Cloudinary) or a plain link attached to a project, task or document. */
export const attachmentInput = z.object({
  name: text(200).min(1, "Enter a name"),
  url: linkField.refine((v) => v !== "", "Add a link or upload a file"),
  publicId: text(300).optional(),
  size: z.number().int().min(0).optional(),
  mimeType: text(100).optional(),
});
