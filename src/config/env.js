import "dotenv/config";
import { z } from "zod";

// e.g. 30s, 15m, 12h, 7d, 2w
const duration = z.string().regex(/^\d+[smhdw]$/, "must look like 15m, 12h or 7d");

// An empty value in .env (e.g. `GOOGLE_CLIENT_ID=`) counts as "not set".
const optional = (type) => z.preprocess((v) => (v === "" ? undefined : v), type.optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URLS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .refine(
      (uri) => /^mongodb(\+srv)?:\/\//.test(uri),
      "must start with mongodb:// or mongodb+srv://",
    ),
  MONGODB_DB_NAME: z.string().min(1).default("loyanox"),

  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: duration.default("15m"),
  JWT_REFRESH_EXPIRES_IN: duration.default("7d"),

  // Refresh-token cookie. Use "none" (requires HTTPS) when the frontend and API are on different sites.
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default("loyanox"),

  // Google Drive storage (optional). Admins can also paste these in Admin > Storage instead.
  GOOGLE_CLIENT_ID: optional(z.string()),
  GOOGLE_CLIENT_SECRET: optional(z.string()),
  GOOGLE_DRIVE_FOLDER: z.string().min(1).default("Loyanox Storage"),
  // Public URL of this API, used to build the Google redirect URI. Defaults to the request's own host.
  API_PUBLIC_URL: optional(z.string().url()),
  // Encrypts saved storage credentials. Defaults to a key derived from JWT_REFRESH_SECRET.
  STORAGE_ENCRYPTION_KEY: optional(z.string().min(16)),

  // Storage limit per person, in MB. Admins are unlimited.
  STORAGE_QUOTA_INTERN_MB: z.coerce.number().positive().default(5120),
  STORAGE_QUOTA_MENTOR_MB: z.coerce.number().positive().default(10240),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");
  // The logger depends on env, so report this one failure directly.
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n\nSee .env.example.\n`);
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  isDev: parsed.data.NODE_ENV === "development",
  isTest: parsed.data.NODE_ENV === "test",
});
