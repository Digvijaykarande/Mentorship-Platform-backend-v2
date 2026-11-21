import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../config/constants.js";
import { User } from "../modules/users/user.model.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";

/**
 * Requires a valid access token ("Authorization: Bearer <jwt>") and loads the user.
 * The user is re-read on every request so disabling an account or changing a password takes
 * effect immediately instead of waiting for the access token to expire.
 */
export async function authenticate(req, _res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw ApiError.unauthorized("Authentication required", { code: "NO_TOKEN" });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err.name === "TokenExpiredError")
      throw ApiError.unauthorized("Session expired", { code: "TOKEN_EXPIRED" });
    throw ApiError.unauthorized("Invalid token", { code: "INVALID_TOKEN" });
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive)
    throw ApiError.unauthorized("Account not available", { code: "ACCOUNT_UNAVAILABLE" });

  // `pwd` is the password version the token was issued for; a password change invalidates older tokens.
  if ((payload.pwd ?? 0) !== (user.passwordChangedAt?.getTime() ?? 0)) {
    throw ApiError.unauthorized("Password was changed, please sign in again", {
      code: "TOKEN_EXPIRED",
    });
  }

  req.user = user;
  return next();
}

/**
 * Role guard, used after `authenticate`:  router.get("/", authenticate, authorize(ROLES.ADMIN), ...)
 * Self-registered mentors are blocked until an admin approves them.
 */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    const { user } = req;
    if (!user) throw ApiError.unauthorized("Authentication required", { code: "NO_TOKEN" });
    if (!roles.includes(user.role)) throw ApiError.forbidden();
    if (user.role === ROLES.MENTOR && !user.isApproved) {
      throw ApiError.forbidden("Your mentor account is waiting for admin approval", {
        code: "MENTOR_NOT_APPROVED",
      });
    }
    return next();
  };
