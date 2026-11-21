import { env } from "../../config/env.js";
import { maskSecret } from "./crypto.js";
import { parseCloudinaryUsage } from "./cloudinary.parse.js";
import { isCloudinaryConfigured } from "./settings.service.js";

/**
 * What the admin sees about the Cloudinary account behind CLOUDINARY_*: plan, credits, storage,
 * bandwidth and a live connection check. Read-only; uploads still use the signed flow in upload.routes.js.
 */
let cache = null;
const TTL_MS = 60_000;

export async function cloudinaryStatus({ refresh = false } = {}) {
  const base = {
    id: "cloudinary",
    configured: isCloudinaryConfigured(),
    account: isCloudinaryConfigured()
      ? { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: maskSecret(env.CLOUDINARY_API_KEY, 4, 3), folder: env.CLOUDINARY_FOLDER, source: "server environment" }
      : null,
  };
  if (!base.configured) return { ...base, status: "not_configured", usage: null, error: null, checkedAt: null };
  if (!refresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const started = Date.now();
  let value;
  try {
    const auth = Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString("base64");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/usage`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const bad = res.status === 401 || res.status === 403;
      value = { ...base, status: "error", usage: null, checkedAt: new Date().toISOString(), error: bad ? "Cloudinary rejected the saved API key or secret." : body?.error?.message || `Cloudinary returned ${res.status}` };
    } else {
      value = { ...base, status: "connected", usage: { ...parseCloudinaryUsage(body), latencyMs: Date.now() - started }, error: null, checkedAt: new Date().toISOString() };
    }
  } catch (err) {
    value = { ...base, status: "error", usage: null, error: `Could not reach Cloudinary (${err?.message || "network error"})`, checkedAt: new Date().toISOString() };
  }
  cache = { at: Date.now(), value };
  return value;
}
