import { PROVIDER_IDS, PROVIDERS } from "./providers.js";

const NON_DEFAULT = PROVIDER_IDS.filter((p) => p !== PROVIDERS.CLOUDINARY);

/** MongoDB expression: which provider does this file's publicId point to? */
export const providerExpr = (field = "$f.publicId") =>
  NON_DEFAULT.reduceRight(
    (otherwise, provider) => ({
      $cond: [{ $regexMatch: { input: { $ifNull: [field, ""] }, regex: `^${provider}:` } }, provider, otherwise],
    }),
    PROVIDERS.CLOUDINARY,
  );

/** Pure: fold the rows of every source into { cloudinary: {bytes, files}, gdrive: {...} }. */
export function mergeProviderRows(...lists) {
  const out = Object.fromEntries(PROVIDER_IDS.map((p) => [p, { bytes: 0, files: 0 }]));
  for (const rows of lists) {
    for (const row of rows ?? []) {
      if (!out[row._id]) continue;
      out[row._id].bytes += row.bytes ?? 0;
      out[row._id].files += row.files ?? 0;
    }
  }
  return out;
}
