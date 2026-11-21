/** Pure: turns Cloudinary's /usage response into the numbers the admin card shows. */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Cloudinary's /usage response varies by plan, so every field is optional. Exported for tests. */
export function parseCloudinaryUsage(u = {}) {
  return {
    plan: typeof u.plan === "string" ? u.plan : null,
    lastUpdated: typeof u.last_updated === "string" ? u.last_updated : null,
    storageBytes: num(u.storage?.usage),
    storageLimitBytes: num(u.storage?.limit),
    credits: { used: num(u.credits?.usage), limit: num(u.credits?.limit), percent: num(u.credits?.used_percent) },
    bandwidthBytes: num(u.bandwidth?.usage),
    transformations: num(u.transformations?.usage),
    assets: num(u.resources) ?? num(u.objects?.usage),
    requests: num(u.requests),
    maxFileBytes: {
      image: num(u.media_limits?.image_max_size_bytes),
      video: num(u.media_limits?.video_max_size_bytes),
      raw: num(u.media_limits?.raw_max_size_bytes),
    },
  };
}

