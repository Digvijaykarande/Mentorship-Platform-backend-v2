import crypto from "node:crypto";

/**
 * Encrypts small secrets (OAuth client secret, refresh token) before they are saved in MongoDB.
 * AES-256-GCM with a key derived from `secret`. Output: "v1.<iv>.<tag>.<data>" (base64url).
 * Pure: the secret is passed in, so this file has no config or database dependency.
 */
const keyFrom = (secret) =>
  Buffer.from(crypto.hkdfSync("sha256", String(secret), "loyanox-storage", "credentials-v1", 32));

export function encrypt(plain, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Returns the original text, or null when the value is missing, tampered with or the key changed. */
export function decrypt(payload, secret) {
  try {
    const [version, iv, tag, data] = String(payload ?? "").split(".");
    if (version !== "v1" || !iv || !tag || !data) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "123456-abc.apps.googleusercontent.com" -> "123456…ontent.com" (safe to show in the UI). */
export const maskSecret = (value, head = 6, tail = 10) => {
  const v = String(value ?? "");
  if (!v) return "";
  return v.length <= head + tail + 1 ? `${v.slice(0, 2)}…` : `${v.slice(0, head)}…${v.slice(-tail)}`;
};
