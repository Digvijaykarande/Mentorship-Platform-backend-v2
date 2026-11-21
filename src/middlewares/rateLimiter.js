import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const handler = (_req, res) =>
  res.status(429).json({
    success: false,
    code: "RATE_LIMITED",
    message: "Too many requests, please try again later.",
  });

const base = { standardHeaders: "draft-7", legacyHeaders: false, handler, skip: () => env.isTest };

/** Broad limiter for the whole API. */
export const apiLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 600 });

/** Strict limiter for credential endpoints (login/register/refresh). */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
});
