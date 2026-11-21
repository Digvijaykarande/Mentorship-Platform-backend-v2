import crypto from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { ROLES } from "../../config/constants.js";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { ApiError } from "../../utils/ApiError.js";
import { ok } from "../../utils/apiResponse.js";
import { idParams, objectId } from "../../utils/objectId.js";
import { listFiles } from "./files.service.js";
import { requestMoreSpace, setQuota } from "./quota.service.js";
import { MAX_FILE_BYTES, assertStorageAvailable, storageUsage } from "./usage.service.js";
import { getDriveAccessToken, relayUpload } from "../storage/google.service.js";
import { PROVIDERS } from "../storage/providers.js";
import { activeProvider } from "../storage/settings.service.js";

/**
 * Files go straight from the browser to Cloudinary, so large uploads never pass through this
 * server. The browser asks here for a short-lived signature, then POSTs the file to `uploadUrl`.
 * The API secret never leaves the server.
 */
export const isUploadConfigured = () =>
  Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

export function signUpload(userId, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  const folder = `${env.CLOUDINARY_FOLDER}/${userId}`;
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(toSign + env.CLOUDINARY_API_SECRET)
    .digest("hex");
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature,
    maxFileBytes: MAX_FILE_BYTES,
  };
}

const router = Router();
router.use(authenticate);

/**
 * Tells the browser HOW to upload, depending on where the admin chose to keep new files:
 *   mode "direct"  Cloudinary: the browser posts the file to Cloudinary with this signature (unchanged).
 *   mode "relay"   Google Drive: the browser posts the file to POST /uploads/relay below.
 */
router.post("/sign", async (req, res) => {
  const provider = await activeProvider();
  // The browser tells us how big the file is so a full account is stopped before anything is uploaded.
  const size = Number(req.body?.size);
  const incoming = Number.isFinite(size) && size > 0 ? size : 0;

  if (provider === PROVIDERS.GDRIVE) {
    await getDriveAccessToken(); // fails early with a clear message if Drive is disconnected
    await assertStorageAvailable(req.user, incoming);
    return ok(res, { provider, mode: "relay", uploadUrl: "/uploads/relay", maxFileBytes: MAX_FILE_BYTES });
  }

  if (!isUploadConfigured()) {
    throw new ApiError(503, "File uploads are not configured on the server. Add a link instead.", {
      code: "UPLOADS_DISABLED",
    });
  }
  await assertStorageAvailable(req.user, incoming);
  return ok(res, { ...signUpload(String(req.user._id)), provider: PROVIDERS.CLOUDINARY, mode: "direct" });
});

/**
 * Relay upload (Google Drive): the raw file is the request body, so no multipart parser is needed.
 * Same limits as the direct flow: 10 MB per file and the person's storage quota.
 */
const relayQuery = z.object({ name: z.string().trim().min(1).max(200), type: z.string().trim().max(100).optional() });
router.post(
  "/relay",
  express.raw({ type: () => true, limit: MAX_FILE_BYTES + 1024 }),
  validate({ query: relayQuery }),
  async (req, res) => {
    if ((await activeProvider()) !== PROVIDERS.GDRIVE) {
      throw new ApiError(409, "Uploads are not going to Google Drive right now. Please try again.", { code: "PROVIDER_CHANGED" });
    }
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw ApiError.badRequest("The file is empty.", { code: "EMPTY_FILE" });
    if (buffer.length > MAX_FILE_BYTES) {
      throw new ApiError(413, `${req.validated.query.name} is larger than ${Math.round(MAX_FILE_BYTES / 1048576)} MB`, { code: "FILE_TOO_LARGE" });
    }
    await assertStorageAvailable(req.user, buffer.length);
    const { name, type } = req.validated.query;
    return ok(res, await relayUpload(req.user, { name, mimeType: type, buffer }));
  },
);

// Storage used and limit per person (admin: everyone, mentor: self + interns, intern: self).
router.get("/usage", async (req, res) => ok(res, await storageUsage(req.user)));

// The individual files behind a storage number. ?user=<id> for admins (anyone) and mentors (their interns).
router.get("/files", validate({ query: z.object({ user: objectId.optional() }) }), async (req, res) =>
  ok(res, await listFiles(req.user, req.validated.query.user)),
);

// Admin only: give one person a custom limit (MB), or send null to go back to the role default.
const quotaBody = z.object({ quotaMb: z.number().positive().max(1024 * 1024).nullable() });
router.patch("/quota/:id", authorize(ROLES.ADMIN), validate({ params: idParams, body: quotaBody }), async (req, res) =>
  ok(res, await setQuota(req.params.id, req.body.quotaMb), { message: "Storage limit updated" }),
);

// Interns and mentors ask the admins for more space.
const requestBody = z.object({
  requestedMb: z.number().int().positive().max(1024 * 1024).optional(),
  reason: z.string().trim().max(300).optional(),
});
router.post("/request", validate({ body: requestBody }), async (req, res) =>
  ok(res, await requestMoreSpace(req.user, req.body), { message: "Request sent to the admins" }),
);

export default router;
