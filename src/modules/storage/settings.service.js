import { env } from "../../config/env.js";
import { decrypt, encrypt } from "./crypto.js";
import { PROVIDERS } from "./providers.js";
import { StorageSettings } from "./storageSettings.model.js";

/** Key that protects saved credentials. A dedicated key is best; otherwise one derived from the JWT refresh secret. */
export const encryptionSecret = () => env.STORAGE_ENCRYPTION_KEY || env.JWT_REFRESH_SECRET;
export const seal = (plain) => encrypt(plain, encryptionSecret());
export const unseal = (payload) => decrypt(payload, encryptionSecret());

const SECRET_FIELDS = "+gdrive.clientSecretEnc +gdrive.refreshTokenEnc";

/** The settings document (created on first use), as a plain object that includes the encrypted secrets. */
export async function loadSettings() {
  return StorageSettings.findOneAndUpdate({ key: "global" }, { $setOnInsert: { activeProvider: PROVIDERS.CLOUDINARY } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true })
    .select(SECRET_FIELDS)
    .lean();
}

/** Apply a $set patch (dot paths allowed) and return the fresh document. */
export async function patchSettings(set = {}, unset = {}) {
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  // No insert defaults here: loadSettings() creates the document, and defaults on a $set of child paths can conflict.
  const doc = await StorageSettings.findOneAndUpdate({ key: "global" }, update, { upsert: true, returnDocument: "after", setDefaultsOnInsert: false })
    .select(SECRET_FIELDS)
    .lean();
  activeCache = null;
  return doc;
}

/* The active provider is read on every upload, so keep it for a few seconds. */
let activeCache = null;
const ACTIVE_TTL_MS = 10_000;

export async function activeProvider() {
  if (activeCache && Date.now() - activeCache.at < ACTIVE_TTL_MS) return activeCache.value;
  const value = (await loadSettings()).activeProvider || PROVIDERS.CLOUDINARY;
  activeCache = { at: Date.now(), value };
  return value;
}
export const forgetActiveProvider = () => {
  activeCache = null;
};

export const isCloudinaryConfigured = () => Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

/** Google OAuth client: the one saved by the admin wins, the server's GOOGLE_* variables are the fallback. */
export function driveClientOf(settings) {
  const saved = settings?.gdrive;
  const savedSecret = unseal(saved?.clientSecretEnc);
  if (saved?.clientId && savedSecret) return { clientId: saved.clientId, clientSecret: savedSecret, source: "admin" };
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, source: "server" };
  return null;
}
