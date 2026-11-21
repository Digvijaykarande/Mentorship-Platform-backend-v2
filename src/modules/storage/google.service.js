import { env } from "../../config/env.js";
import { API_PREFIX, ROLES } from "../../config/constants.js";
import { ApiError } from "../../utils/ApiError.js";
import { logger } from "../../utils/logger.js";
import { idOf, iso } from "../../utils/serialize.js";
import { logActivity } from "../admin/activity.service.js";
import { notify } from "../notifications/notification.service.js";
import { User } from "../users/user.model.js";
import { maskSecret } from "./crypto.js";
import * as google from "./google.client.js";
import { signState, verifyState } from "./oauthState.js";
import { PROVIDERS, withProviderPrefix } from "./providers.js";
import { driveClientOf, encryptionSecret, loadSettings, patchSettings, seal, unseal } from "./settings.service.js";

/* ------------------------------ access token ------------------------------ */

let tokenCache = null; // { token, expiresAt }
const forgetToken = () => {
  tokenCache = null;
  aboutCache = null;
};

async function markNeedsReauth(reason) {
  const before = await loadSettings();
  await patchSettings({ "gdrive.status": "needs_reauth", "gdrive.lastError": String(reason).slice(0, 500) });
  forgetToken();
  if (before.gdrive?.status === "connected") {
    const admins = await User.find({ role: ROLES.ADMIN, isActive: true }).distinct("_id");
    await notify(admins, {
      type: "storage-reauth",
      title: "Google Drive needs to be reconnected",
      description: "Google stopped accepting the saved connection, so uploads to Drive are paused. Reconnect it from Admin > Storage.",
      category: "Storage",
      accent: "rose",
      actionLabel: "Open storage",
      link: "/admin/storage",
    });
  }
}

/** A valid access token for the connected Drive account. Refreshes (and caches) it when needed. */
export async function getDriveAccessToken() {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 60_000) return tokenCache.token;

  const settings = await loadSettings();
  const drive = settings.gdrive;
  const client = driveClientOf(settings);
  const refreshToken = unseal(drive?.refreshTokenEnc);
  if (drive?.status === "needs_reauth") {
    throw new ApiError(503, "Google Drive needs to be reconnected by an admin. Add a link instead for now.", { code: "STORAGE_REAUTH_REQUIRED" });
  }
  if (drive?.status !== "connected" || !client || !refreshToken) {
    throw new ApiError(503, "Google Drive is not connected. Ask an admin to connect it in Admin > Storage.", { code: "STORAGE_NOT_CONNECTED" });
  }
  try {
    const fresh = await google.refreshAccessToken({ ...client, refreshToken });
    tokenCache = { token: fresh.accessToken, expiresAt: Date.now() + fresh.expiresIn * 1000 };
    return tokenCache.token;
  } catch (err) {
    if (err.reason === "invalid_grant" || err.reason === "invalid_client" || err.status === 401) {
      await markNeedsReauth(err.message);
      throw new ApiError(503, "Google Drive needs to be reconnected by an admin. Add a link instead for now.", { code: "STORAGE_REAUTH_REQUIRED" });
    }
    logger.warn({ err: err.message }, "Could not refresh the Google Drive token");
    throw new ApiError(502, "Google Drive is not reachable right now. Try again in a moment.", { code: "STORAGE_UNAVAILABLE" });
  }
}

/* --------------------------------- connect -------------------------------- */

const trimSlash = (u) => u.replace(/\/$/, "");

/** The URL Google sends the admin back to. The admin must add exactly this in Google Cloud Console. */
export const redirectUriFor = (req) =>
  `${trimSlash(env.API_PUBLIC_URL || `${req.protocol}://${req.get("host")}`)}${API_PREFIX}/storage/google/callback`;

const allowedReturn = (value) => {
  const origin = (() => {
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  })();
  return origin && env.CLIENT_URLS.includes(origin) ? origin : env.CLIENT_URLS[0];
};

/** Step 1: save the credentials the admin pasted (or use saved/server ones) and build the Google consent URL. */
export async function startConnect(admin, req, { clientId, clientSecret, returnTo } = {}) {
  const current = await loadSettings();
  if (clientId && clientSecret) {
    const changed = current.gdrive?.clientId !== clientId;
    await patchSettings(
      { "gdrive.clientId": clientId, "gdrive.clientSecretEnc": seal(clientSecret), ...(changed && { "gdrive.status": "pending" }) },
      changed ? { "gdrive.refreshTokenEnc": "" } : {},
    );
    forgetToken();
  } else if (clientId || clientSecret) {
    throw ApiError.badRequest("Enter both the Client ID and the Client Secret.", { code: "CREDENTIALS_INCOMPLETE" });
  }

  const client = driveClientOf(await loadSettings());
  if (!client) {
    throw ApiError.badRequest("Add your Google Client ID and Client Secret first.", { code: "CREDENTIALS_REQUIRED" });
  }
  const redirectUri = redirectUriFor(req);
  const state = signState({ uid: idOf(admin), returnTo: allowedReturn(returnTo), redirectUri }, encryptionSecret());
  return { authUrl: google.buildAuthUrl({ clientId: client.clientId, redirectUri, state, loginHint: undefined }), redirectUri };
}

/** The Drive folder every upload lives under. Created once, found again by a hidden tag. */
async function ensureRootFolder(token) {
  return google.ensureFolder(token, { name: env.GOOGLE_DRIVE_FOLDER, tag: { loyanoxRoot: "1" } });
}

/**
 * Step 2: Google redirected back with ?code. Returns the client URL to send the browser to.
 * Never throws: whatever happens, the admin lands back on the Storage page with a clear message.
 */
export async function handleCallback({ code, state, error }) {
  const payload = verifyState(state, encryptionSecret());
  const back = (query) => `${payload?.returnTo || env.CLIENT_URLS[0]}/admin/storage?${new URLSearchParams(query)}`;
  if (!payload) return back({ storage: "error", message: "This sign-in link expired. Start the connection again." });
  if (error) {
    return back({ storage: "error", message: error === "access_denied" ? "Access was not granted, so nothing was connected." : `Google returned: ${error}` });
  }
  try {
    const settings = await loadSettings();
    const client = driveClientOf(settings);
    if (!client || !code) throw new Error("Missing credentials");
    const tokens = await google.exchangeCode({ ...client, redirectUri: payload.redirectUri, code });
    if (!tokens.refreshToken) {
      return back({
        storage: "error",
        message: "Google did not give long-term access. Remove this app at myaccount.google.com/permissions, then connect again.",
      });
    }
    const about = await google.getAbout(tokens.accessToken);
    const folder = await ensureRootFolder(tokens.accessToken);
    await patchSettings(
      {
        "gdrive.status": "connected",
        "gdrive.refreshTokenEnc": seal(tokens.refreshToken),
        "gdrive.account": about.account,
        "gdrive.rootFolderId": folder.id,
        "gdrive.rootFolderName": folder.name,
        "gdrive.connectedAt": new Date(),
        "gdrive.connectedBy": payload.uid,
        "gdrive.lastError": "",
        "gdrive.lastCheckedAt": new Date(),
      },
    );
    tokenCache = { token: tokens.accessToken, expiresAt: Date.now() + tokens.expiresIn * 1000 };
    userFolders.clear();
    await logActivity({ type: "storage-connected", title: "Google Drive connected", detail: about.account.email, actor: payload.uid });
    return back({ storage: "connected", provider: PROVIDERS.GDRIVE });
  } catch (err) {
    logger.warn({ err: err.message, reason: err.reason }, "Google Drive connection failed");
    const msg =
      err.reason === "invalid_client"
        ? "Google rejected the Client ID or Client Secret. Check them and try again."
        : err.reason === "redirect_uri_mismatch"
          ? "The redirect URI in Google Cloud Console does not match the one shown here."
          : err.reason === "accessNotConfigured" || err.reason === "SERVICE_DISABLED"
            ? "The Google Drive API is switched off for this Google Cloud project. Enable it and try again."
            : "Could not finish connecting to Google Drive. Please try again.";
    return back({ storage: "error", message: msg });
  }
}

/** Forget the saved connection. Files already in Drive stay there and their links keep working. */
export async function disconnectDrive(admin) {
  const settings = await loadSettings();
  if (settings.activeProvider === PROVIDERS.GDRIVE) {
    throw new ApiError(409, "Google Drive is currently used for new uploads. Switch to another storage first.", { code: "PROVIDER_IN_USE" });
  }
  const refreshToken = unseal(settings.gdrive?.refreshTokenEnc);
  if (refreshToken) await google.revokeToken(refreshToken);
  await patchSettings(
    { "gdrive.status": "none" },
    { "gdrive.refreshTokenEnc": "", "gdrive.clientSecretEnc": "", "gdrive.clientId": "", "gdrive.account": "", "gdrive.rootFolderId": "", "gdrive.rootFolderName": "", "gdrive.connectedAt": "", "gdrive.connectedBy": "", "gdrive.lastError": "" },
  );
  forgetToken();
  userFolders.clear();
  await logActivity({ type: "storage-disconnected", title: "Google Drive disconnected", detail: settings.gdrive?.account?.email, actor: admin });
}

/* --------------------------------- status --------------------------------- */

let aboutCache = null;
const ABOUT_TTL_MS = 60_000;

/** Everything the admin card shows. Calls Google for live space numbers (cached for a minute). */
export async function driveStatus({ refresh = false } = {}) {
  const settings = await loadSettings();
  const d = settings.gdrive ?? {};
  const client = driveClientOf(settings);
  const base = {
    id: PROVIDERS.GDRIVE,
    configured: d.status === "connected" || d.status === "needs_reauth",
    status: d.status === "connected" ? "connected" : d.status === "needs_reauth" ? "needs_reauth" : "not_configured",
    hasClient: Boolean(client),
    clientSource: client?.source ?? null,
    clientIdMasked: client ? maskSecret(client.clientId, 8, 24) : "",
    connectedAt: iso(d.connectedAt),
    connectedBy: d.connectedBy ? idOf(d.connectedBy) : null,
    folder: d.rootFolderId ? { id: d.rootFolderId, name: d.rootFolderName, url: `https://drive.google.com/drive/folders/${d.rootFolderId}` } : null,
    account: d.account ? { ...d.account } : null,
    quota: null,
    error: d.lastError || null,
    checkedAt: iso(d.lastCheckedAt),
  };
  if (d.status !== "connected") return base;

  if (!refresh && aboutCache && Date.now() - aboutCache.at < ABOUT_TTL_MS) return { ...base, ...aboutCache.value };
  try {
    const token = await getDriveAccessToken();
    const about = await google.getAbout(token);
    const now = new Date();
    await patchSettings({ "gdrive.account": about.account, "gdrive.lastCheckedAt": now, "gdrive.lastError": "" });
    aboutCache = { at: Date.now(), value: { account: about.account, quota: about.quota, error: null, checkedAt: now.toISOString() } };
    return { ...base, ...aboutCache.value };
  } catch (err) {
    const needsReauth = err?.code === "STORAGE_REAUTH_REQUIRED";
    return { ...base, status: needsReauth ? "needs_reauth" : "error", error: err.message, checkedAt: base.checkedAt };
  }
}

/* --------------------------------- upload --------------------------------- */

const userFolders = new Map(); // userId -> Drive folder id
const pendingFolders = new Map(); // userId -> Promise, so two uploads at once make one folder

async function folderFor(token, user, rootId) {
  const uid = idOf(user);
  if (userFolders.has(uid)) return userFolders.get(uid);
  if (!pendingFolders.has(uid)) {
    pendingFolders.set(
      uid,
      google
        .ensureFolder(token, { name: `${user.name} (${user.code || uid})`.slice(0, 120), parentId: rootId, tag: { loyanoxUser: uid } })
        .then((f) => {
          userFolders.set(uid, f.id);
          return f.id;
        })
        .finally(() => pendingFolders.delete(uid)),
    );
  }
  return pendingFolders.get(uid);
}

/**
 * Stores one file in the connected Drive (inside "<root>/<person>") and shares it by link.
 * Resolves to the same shape the browser gets for a Cloudinary upload.
 */
export async function relayUpload(user, { name, mimeType, buffer }) {
  const settings = await loadSettings();
  if (!settings.gdrive?.rootFolderId) throw new ApiError(503, "Google Drive is not connected.", { code: "STORAGE_NOT_CONNECTED" });
  const fileName = google.safeFileName(name);
  const type = google.safeMimeType(mimeType);

  const attempt = async () => {
    const token = await getDriveAccessToken();
    const parentId = await folderFor(token, user, settings.gdrive.rootFolderId);
    const file = await google.uploadFile(token, { name: fileName, mimeType: type, parentId, buffer, appProperties: { loyanoxUser: idOf(user) } });
    await google.shareWithLink(token, file.id);
    return file;
  };

  let file;
  try {
    try {
      file = await attempt();
    } catch (err) {
      // The token was revoked or the person's folder was deleted by hand: reset what we cached and retry once.
      if (err instanceof google.GoogleError && (err.status === 401 || err.status === 404)) {
        if (err.status === 401) forgetToken();
        userFolders.delete(idOf(user));
        file = await attempt();
      } else throw err;
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof google.GoogleError) {
      logger.warn({ reason: err.reason, status: err.status, msg: err.message }, "Drive upload failed");
      if (err.reason === "storageQuotaExceeded") {
        throw new ApiError(507, "The connected Google Drive is out of space. Ask an admin to free up space or switch storage.", { code: "STORAGE_PROVIDER_FULL" });
      }
      if (err.status === 401 || err.reason === "invalid_grant") {
        await markNeedsReauth(err.message);
        throw new ApiError(503, "Google Drive needs to be reconnected by an admin. Add a link instead for now.", { code: "STORAGE_REAUTH_REQUIRED" });
      }
      throw new ApiError(502, `Could not save ${fileName} to Google Drive. Please try again.`, { code: "STORAGE_UNAVAILABLE" });
    }
    throw err;
  }

  return {
    name: fileName,
    url: google.driveViewUrl(file.id),
    imageUrl: google.driveImageUrl(file.id),
    publicId: withProviderPrefix(PROVIDERS.GDRIVE, file.id),
    size: buffer.length,
    mimeType: type,
    provider: PROVIDERS.GDRIVE,
  };
}
