import { z } from "zod";

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

// bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
export const passwordField = z
  .string()
  .min(8, "Use at least 8 characters")
  .refine((v) => Buffer.byteLength(v) <= 72, "Password is too long (max 72 bytes)");

const text = (max) => z.string().trim().max(max);

// Field names mirror the frontend profile form (flat), so the form can be sent as-is.
export const updateProfileBody = z.object({
  firstName: text(60).optional(),
  lastName: text(60).optional(),
  username: text(40)
    .regex(/^[a-zA-Z0-9._-]*$/, "Username can only contain letters, numbers, . _ -")
    .optional(),
  dob: text(40).optional(),
  gender: text(20).optional(),
  phone: text(30).optional(),
  location: text(120).optional(),
  address: text(250).optional(),
  headline: text(120).optional(),
  company: text(120).optional(),
  bio: text(1000).optional(),
  careerInterests: text(300).optional(),
  areasOfInterest: text(300).optional(),
  professionalGoals: text(500).optional(),
  linkedin: text(200).optional(),
  github: text(200).optional(),
  portfolio: text(200).optional(),
  website: text(200).optional(),
  otherLinks: z
    .array(z.object({ name: text(60), url: text(300) }))
    .max(10)
    .optional(),
  skills: z.array(text(40).min(1)).max(40).optional(),
  // Profile photo (already uploaded to Cloudinary by the browser); null removes it.
  avatar: z
    .object({ url: text(600).regex(/^https:\/\//, "Photo link must be https"), publicId: text(300).optional() })
    .nullable()
    .optional(),
});

export const updateSettingsBody = z.object({
  language: text(30).optional(),
  compactSidebar: z.boolean().optional(),
  twoFactor: z.boolean().optional(),
  notifications: z.record(z.string(), z.boolean()).optional(),
});
