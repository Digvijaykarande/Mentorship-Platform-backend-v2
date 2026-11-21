import crypto from "node:crypto";

/**
 * Thin Google OAuth + Drive v3 client. No SDK: plain fetch, same as the Cloudinary upload.
 * Every function takes the HTTP function as an option so tests can run without a network.
 * Scope is `drive.file`: the app only ever sees files and folders it created itself.
 */
export const SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
export const FOLDER_MIME = "application/vnd.google-apps.folder";
const TIMEOUT_MS = 60_000;

/** A failed Google call. `reason` is Google's own code (e.g. "invalid_grant", "storageQuotaExceeded"). */
export class GoogleError extends Error {
  constructor(message, { status = 502, reason = "" } = {}) {
    super(message);
    this.name = "GoogleError";
    this.status = status;
    this.reason = reason;
  }
}

async function call(url, { fetch: f = globalThis.fetch, token, ...init } = {}) {
  let res;
  try {
    res = await f(url, {
      ...init,
      headers: { ...(token && { Authorization: `Bearer ${token}` }), ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new GoogleError(`Could not reach Google (${err?.message || "network error"})`, { status: 0, reason: "network" });
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const reason = body?.error_description ? body.error : body?.error?.errors?.[0]?.reason || body?.error?.status || body?.error || "";
    const message = body?.error_description || body?.error?.message || (typeof body?.error === "string" ? body.error : "") || `Google returned ${res.status}`;
    throw new GoogleError(message, { status: res.status, reason: String(reason) });
  }
  return body;
}

const form = (data) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(data).toString(),
});

/* ------------------------------- OAuth ------------------------------- */

export function buildAuthUrl({ clientId, redirectUri, state, loginHint }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // gives us a refresh token
    prompt: "consent", // ...every time, even if this account connected before
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${AUTH_URL}?${params}`;
}

export const exchangeCode = ({ clientId, clientSecret, redirectUri, code }, opts) =>
  call(TOKEN_URL, { ...opts, ...form({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) }).then((b) => ({
    accessToken: b.access_token,
    refreshToken: b.refresh_token ?? null,
    expiresIn: Number(b.expires_in) || 3600,
    scope: b.scope || "",
  }));

export const refreshAccessToken = ({ clientId, clientSecret, refreshToken }, opts) =>
  call(TOKEN_URL, { ...opts, ...form({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) }).then((b) => ({
    accessToken: b.access_token,
    expiresIn: Number(b.expires_in) || 3600,
  }));

/** Best effort: tell Google this token is no longer wanted. */
export const revokeToken = (token, opts) => call(REVOKE_URL, { ...opts, ...form({ token }) }).catch(() => null);

/* -------------------------------- Drive ------------------------------- */

/** Who is connected and how much space they have. */
export async function getAbout(token, opts) {
  const b = await call(`${API}/about?fields=${encodeURIComponent("user(displayName,emailAddress,photoLink,permissionId),storageQuota")}`, { ...opts, token });
  const q = b.storageQuota ?? {};
  const num = (v) => (v === undefined || v === null ? null : Number(v));
  const limit = num(q.limit); // absent for unlimited (Workspace pooled) plans
  const usage = num(q.usage) ?? 0;
  return {
    account: {
      id: b.user?.permissionId ?? "",
      name: b.user?.displayName ?? "",
      email: b.user?.emailAddress ?? "",
      picture: b.user?.photoLink ?? "",
    },
    quota: {
      limit,
      usage,
      inDrive: num(q.usageInDrive) ?? 0,
      inTrash: num(q.usageInDriveTrash) ?? 0,
      free: limit === null ? null : Math.max(0, limit - usage),
    },
  };
}

const esc = (v) => String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Finds a folder this app created (matched by an appProperties tag, so renames don't matter) or makes it. */
export async function ensureFolder(token, { name, parentId, tag }, opts) {
  const [key, value] = Object.entries(tag)[0];
  const q = [`mimeType='${FOLDER_MIME}'`, "trashed=false", `appProperties has { key='${esc(key)}' and value='${esc(value)}' }`, parentId && `'${esc(parentId)}' in parents`]
    .filter(Boolean)
    .join(" and ");
  const found = await call(`${API}/files?${new URLSearchParams({ q, fields: "files(id,name)", pageSize: "1", spaces: "drive" })}`, { ...opts, token });
  if (found?.files?.[0]) return found.files[0];
  return call(`${API}/files?fields=id,name`, {
    ...opts,
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId && { parents: [parentId] }), appProperties: { [key]: String(value) } }),
  });
}

/** multipart/related body Drive expects: JSON metadata part + raw file part. Pure, exported for tests. */
export function buildMultipart(metadata, buffer, mimeType, boundary = `loyanox${crypto.randomBytes(12).toString("hex")}`) {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  return { boundary, body: Buffer.concat([head, buffer, tail]) };
}

export async function uploadFile(token, { name, mimeType, parentId, buffer, appProperties }, opts) {
  const { boundary, body } = buildMultipart({ name, ...(parentId && { parents: [parentId] }), ...(appProperties && { appProperties }) }, buffer, mimeType);
  return call(`${UPLOAD}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink`, {
    ...opts,
    token,
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}`, "Content-Length": String(body.length) },
    body,
  });
}

/** "Anyone with the link can view": matches how Cloudinary links already behave, so everyone can open attachments. */
export const shareWithLink = (token, fileId, opts) =>
  call(`${API}/files/${encodeURIComponent(fileId)}/permissions?fields=id`, {
    ...opts,
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone", allowFileDiscovery: false }),
  });

/* ------------------------------- helpers ------------------------------ */

/** Safe Drive file name: no path separators or control characters, never empty, max 200 chars. */
export const safeFileName = (name) =>
  String(name ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/\u0000-\u001f]+/g, "_")
    .trim()
    .slice(0, 200) || "file";

export const safeMimeType = (type) => (/^[\w.+-]+\/[\w.+-]+$/.test(String(type ?? "")) ? String(type) : "application/octet-stream");

export const driveViewUrl = (id) => `https://drive.google.com/file/d/${id}/view`;
/** Embeddable picture link (for avatars and previews); only works because files are shared by link. */
export const driveImageUrl = (id, size = 1024) => `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
