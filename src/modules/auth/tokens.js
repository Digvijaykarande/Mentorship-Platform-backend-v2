import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { toMs, toSeconds } from "../../utils/duration.js";

const ISSUER = "loyanox-api";
const ALGORITHMS = ["HS256"];

export const ACCESS_TTL_SECONDS = toSeconds(env.JWT_ACCESS_EXPIRES_IN);
export const REFRESH_TTL_MS = toMs(env.JWT_REFRESH_EXPIRES_IN);
/** Non-"remember me" sessions live at most a day on the server, whatever the refresh TTL is. */
export const SESSION_TTL_MS = Math.min(REFRESH_TTL_MS, toMs("1d"));

export const newId = () => crypto.randomUUID();

export const signAccessToken = (user) =>
  jwt.sign(
    { role: user.role, pwd: user.passwordChangedAt?.getTime() ?? 0 },
    env.JWT_ACCESS_SECRET,
    {
      subject: String(user.id ?? user._id),
      issuer: ISSUER,
      expiresIn: ACCESS_TTL_SECONDS,
      algorithm: "HS256",
    },
  );

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER, algorithms: ALGORITHMS });

export const signRefreshToken = ({ userId, jti, family, ttlMs }) =>
  jwt.sign({ fam: family }, env.JWT_REFRESH_SECRET, {
    subject: String(userId),
    jwtid: jti,
    issuer: ISSUER,
    expiresIn: Math.floor(ttlMs / 1000),
    algorithm: "HS256",
  });

export const verifyRefreshToken = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: ISSUER, algorithms: ALGORITHMS });

/** Decode without verifying (used on logout, where an expired token must still be revoked). */
export const decodeRefreshToken = (token) => jwt.decode(token);
