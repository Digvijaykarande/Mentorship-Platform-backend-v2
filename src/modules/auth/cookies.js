import { env } from "../../config/env.js";
import { API_PREFIX } from "../../config/constants.js";

export const REFRESH_COOKIE = "refreshToken";

function baseOptions() {
  return {
    httpOnly: true, // not readable from JavaScript, so XSS cannot steal the refresh token
    secure: env.isProd || env.COOKIE_SAME_SITE === "none", // browsers require Secure with SameSite=None
    sameSite: env.COOKIE_SAME_SITE,
    path: `${API_PREFIX}/auth`, // only sent to auth endpoints
    ...(env.COOKIE_DOMAIN && { domain: env.COOKIE_DOMAIN }),
  };
}

/** Persistent sessions get an expiry; "don't remember me" sessions use a browser-session cookie. */
export function setRefreshCookie(res, token, { persistent, expiresAt }) {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(),
    ...(persistent && { expires: expiresAt }),
  });
}

export const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, baseOptions());
