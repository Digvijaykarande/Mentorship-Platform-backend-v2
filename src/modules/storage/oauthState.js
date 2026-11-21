import crypto from "node:crypto";

/**
 * The OAuth `state` value. Google sends the admin's browser back to the callback without our
 * Bearer token, so the state proves who started the connection and that it is recent (CSRF guard).
 * Signed with HMAC-SHA256, valid for 10 minutes.
 */
export const STATE_TTL_MS = 10 * 60 * 1000;

const mac = (body, secret) => crypto.createHmac("sha256", secret).update(body).digest("base64url");

export function signState(payload, secret, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now + STATE_TTL_MS, n: crypto.randomBytes(6).toString("hex") })).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** Returns the payload, or null when the signature is wrong or the state has expired. */
export function verifyState(state, secret, now = Date.now()) {
  const [body, sig] = String(state ?? "").split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}
