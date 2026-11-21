import { ApiError } from "../../utils/ApiError.js";
import { logger } from "../../utils/logger.js";
import { ROLES, USER_STATUS } from "../../config/constants.js";
import { nextCode } from "../common/counter.model.js";
import { User } from "../users/user.model.js";
import { RefreshToken } from "./refreshToken.model.js";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password.js";
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_MS,
  SESSION_TTL_MS,
  decodeRefreshToken,
  newId,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./tokens.js";

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
// A rotated token that is replayed within this window is treated as a client race (two tabs
// refreshing at once), not as theft, so it does not revoke the whole session family.
const REUSE_GRACE_MS = 10_000;

/* ------------------------------ sessions ------------------------------ */

async function createSession(user, { remember, family = newId(), ctx = {} }) {
  const jti = newId();
  const ttlMs = remember ? REFRESH_TTL_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);

  await RefreshToken.create({
    jti,
    family,
    user: user._id,
    expiresAt,
    persistent: remember,
    userAgent: ctx.userAgent?.slice(0, 300),
    ip: ctx.ip,
  });

  return {
    user,
    accessToken: signAccessToken(user),
    expiresIn: ACCESS_TTL_SECONDS,
    refresh: {
      token: signRefreshToken({ userId: user.id, jti, family, ttlMs }),
      persistent: remember,
      expiresAt,
    },
  };
}

const revokeFamily = (family) =>
  RefreshToken.updateMany(
    { family, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );

/* -------------------------------- codes ------------------------------- */

function generateUserCode(role) {
  if (role === ROLES.MENTOR) return nextCode("user-mentor", "MTR", { start: 0, pad: 3 });
  if (role === ROLES.ADMIN) return nextCode("user-admin", "ADM", { start: 0, pad: 3 });
  const year = new Date().getFullYear();
  return nextCode(`user-intern-${year}`, `LYX-INT-${year}`, { start: 0, pad: 3 });
}

/* ------------------------------- use cases ----------------------------- */

export async function register({ name, email, password, role }, ctx) {
  if (await User.exists({ email })) {
    throw ApiError.conflict("An account with this email already exists", { code: "EMAIL_TAKEN" });
  }

  const [firstName, ...rest] = name.split(/\s+/);
  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    role,
    code: await generateUserCode(role),
    status: role === ROLES.MENTOR ? USER_STATUS.AVAILABLE : USER_STATUS.ACTIVE,
    isApproved: role !== ROLES.MENTOR, // mentors wait for an admin to approve them
    profile: { firstName, lastName: rest.join(" ") },
    lastLoginAt: new Date(),
  });

  logger.info({ userId: user.id, role }, "User registered");
  return createSession(user, { remember: true, ctx });
}

export async function login({ email, password, remember }, ctx) {
  const user = await User.findOne({ email }).select(
    "+passwordHash +failedLoginAttempts +lockUntil",
  );

  if (!user) {
    await verifyPassword(password, DUMMY_HASH); // equalise timing
    throw ApiError.unauthorized("Invalid email or password", { code: "INVALID_CREDENTIALS" });
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutes = Math.ceil((user.lockUntil - Date.now()) / 60_000);
    throw ApiError.tooMany(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      {
        code: "ACCOUNT_LOCKED",
      },
    );
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const $set =
      attempts >= MAX_FAILED_LOGINS
        ? { lockUntil: new Date(Date.now() + LOCK_MS), failedLoginAttempts: 0 }
        : { failedLoginAttempts: attempts };
    await User.updateOne({ _id: user._id }, { $set });
    if (attempts >= MAX_FAILED_LOGINS)
      logger.warn({ userId: user.id }, "Account locked after repeated failed logins");
    throw ApiError.unauthorized("Invalid email or password", { code: "INVALID_CREDENTIALS" });
  }

  if (!user.isActive)
    throw ApiError.forbidden("This account has been disabled", { code: "ACCOUNT_DISABLED" });

  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date(), failedLoginAttempts: 0 }, $unset: { lockUntil: 1 } },
  );
  return createSession(user, { remember, ctx });
}

/** Exchanges a valid refresh token for a new access token + a rotated refresh token. */
export async function refresh(rawToken, ctx) {
  if (!rawToken)
    throw ApiError.unauthorized("Session expired, please sign in again", {
      code: "NO_REFRESH_TOKEN",
    });

  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw ApiError.unauthorized("Session expired, please sign in again", {
      code: "INVALID_REFRESH_TOKEN",
    });
  }

  const record = await RefreshToken.findOne({ jti: payload.jti });
  if (!record)
    throw ApiError.unauthorized("Session expired, please sign in again", {
      code: "INVALID_REFRESH_TOKEN",
    });

  if (record.revokedAt) {
    if (Date.now() - record.revokedAt.getTime() > REUSE_GRACE_MS) {
      await revokeFamily(record.family); // a rotated token came back later: assume it was stolen
      logger.warn(
        { userId: String(record.user), family: record.family },
        "Refresh token reuse detected",
      );
      throw ApiError.unauthorized("Session is no longer valid, please sign in again", {
        code: "TOKEN_REUSED",
      });
    }
    throw ApiError.unauthorized("Session expired, please sign in again", { code: "TOKEN_REVOKED" });
  }

  const user = await User.findById(record.user);
  if (!user || !user.isActive) {
    await revokeFamily(record.family);
    throw ApiError.unauthorized("Session expired, please sign in again", {
      code: "INVALID_REFRESH_TOKEN",
    });
  }

  // Atomically claim the old token so two concurrent refreshes cannot both succeed.
  const claimed = await RefreshToken.findOneAndUpdate(
    { jti: record.jti, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  if (!claimed)
    throw ApiError.unauthorized("Session expired, please sign in again", { code: "TOKEN_REVOKED" });

  const session = await createSession(user, {
    remember: record.persistent,
    family: record.family,
    ctx,
  });
  await RefreshToken.updateOne(
    { jti: record.jti },
    { $set: { replacedBy: decodeRefreshToken(session.refresh.token).jti } },
  );
  return session;
}

/** Revokes the session the cookie belongs to. Never throws: logging out must always succeed. */
export async function logout(rawToken) {
  const payload = rawToken ? decodeRefreshToken(rawToken) : null;
  if (!payload?.jti) return;
  try {
    const record = await RefreshToken.findOne({ jti: payload.jti });
    if (record) await revokeFamily(record.family);
  } catch (err) {
    logger.warn({ err }, "Failed to revoke refresh token on logout");
  }
}

export const logoutAll = (userId) =>
  RefreshToken.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );

export async function changePassword(userId, { currentPassword, newPassword }, ctx) {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) throw ApiError.notFound("User not found");

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest("Current password is incorrect", { code: "WRONG_PASSWORD" });
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();

  await logoutAll(user._id); // sign out every device, then keep this one signed in
  return createSession(user, { remember: true, ctx });
}
