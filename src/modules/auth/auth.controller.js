import { ok, created, noContent } from "../../utils/apiResponse.js";
import * as authService from "./auth.service.js";
import * as userService from "../users/user.service.js";
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from "./cookies.js";

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get("user-agent") });

/** Sets the refresh cookie and returns the access token in the body. */
function sendSession(res, session, { status = 200, message } = {}) {
  setRefreshCookie(res, session.refresh.token, session.refresh);
  const body = {
    user: session.user,
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
  };
  return status === 201 ? created(res, body, { message }) : ok(res, body, { message });
}

export const register = async (req, res) =>
  sendSession(res, await authService.register(req.body, ctxOf(req)), {
    status: 201,
    message: "Account created",
  });

export const login = async (req, res) =>
  sendSession(res, await authService.login(req.body, ctxOf(req)));

export const refresh = async (req, res) => {
  try {
    return sendSession(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE], ctxOf(req)));
  } catch (err) {
    clearRefreshCookie(res); // a bad cookie is useless; remove it
    throw err;
  }
};

export const logout = async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  return noContent(res);
};

export const logoutAll = async (req, res) => {
  await authService.logoutAll(req.user._id);
  clearRefreshCookie(res);
  return noContent(res);
};

export const deleteAccount = async (req, res) => {
  await userService.deactivateSelf(req.user);
  await authService.logoutAll(req.user._id);
  clearRefreshCookie(res);
  return noContent(res);
};

export const me = async (req, res) => ok(res, { user: req.user });

export const updateProfile = async (req, res) =>
  ok(
    res,
    { user: await userService.updateProfile(req.user._id, req.body) },
    { message: "Profile updated" },
  );

export const updateSettings = async (req, res) =>
  ok(
    res,
    { user: await userService.updateSettings(req.user._id, req.body) },
    { message: "Settings saved" },
  );

export const changePassword = async (req, res) =>
  sendSession(res, await authService.changePassword(req.user._id, req.body, ctxOf(req)), {
    message: "Password updated. Other devices have been signed out.",
  });
