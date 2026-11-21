/**
 * Where an uploaded file can live. Adding a provider later means: add it here, add a service that
 * implements `status()` and either a signed direct upload or a relay upload, and add a card in the admin UI.
 *
 * A stored file's `publicId` says where it lives: "gdrive:<fileId>" for Google Drive, anything else
 * (every file uploaded before this feature existed) is Cloudinary. Nothing needs migrating.
 */
export const PROVIDERS = Object.freeze({
  CLOUDINARY: "cloudinary",
  GDRIVE: "gdrive",
});
export const PROVIDER_IDS = Object.freeze(Object.values(PROVIDERS));

const PREFIXED = [PROVIDERS.GDRIVE];

export const withProviderPrefix = (provider, id) => (PREFIXED.includes(provider) ? `${provider}:${id}` : id);

export function providerOfFile(file) {
  const id = String(file?.publicId ?? "");
  const hit = PREFIXED.find((p) => id.startsWith(`${p}:`));
  return hit ?? PROVIDERS.CLOUDINARY;
}

/** Drive file id out of a stored publicId ("gdrive:abc" -> "abc"), or null. */
export const driveIdOf = (publicId) => (String(publicId ?? "").startsWith("gdrive:") ? String(publicId).slice(7) : null);
