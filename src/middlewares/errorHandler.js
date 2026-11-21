import mongoose from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

/** Translate known library errors into ApiErrors so every failure has the same shape. */
function normalize(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.unprocessable(details[0]?.message || "Validation failed", {
      code: "VALIDATION_ERROR",
      details,
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid ${err.path}: ${err.value}`, { code: "INVALID_ID" });
  }
  if (err?.code === 11000) {
    const field = (Object.keys(err.keyPattern || err.keyValue || {})[0] || "value")
      .split(".")
      .pop();
    return ApiError.conflict(`A record with this ${field} already exists`, {
      code: "DUPLICATE_KEY",
      details: [{ field }],
    });
  }
  if (err?.name === "JsonWebTokenError")
    return ApiError.unauthorized("Invalid token", { code: "INVALID_TOKEN" });
  if (err?.name === "TokenExpiredError")
    return ApiError.unauthorized("Token expired", { code: "TOKEN_EXPIRED" });
  if (err?.type === "entity.parse.failed")
    return ApiError.badRequest("Malformed JSON body", { code: "INVALID_JSON" });
  if (err?.type === "entity.too.large")
    return new ApiError(413, "Request body too large", { code: "PAYLOAD_TOO_LARGE" });
  return err;
}

export const errorHandler = (rawError, req, res, _next) => {
  const err = normalize(rawError);
  const operational = err instanceof ApiError;
  const status = operational ? err.statusCode : 500;

  const log = req.log || logger;
  if (status >= 500) log.error({ err: rawError }, "Unhandled error");
  else log.warn({ code: err.code, status }, err.message);

  // `message` is what the frontend client (lib/api/client.js) reads.
  res.status(status).json({
    success: false,
    message: operational ? err.message : "Something went wrong on our side",
    ...(err.code && { code: err.code }),
    ...(operational && err.details && { errors: err.details }),
    ...(env.isDev && !operational && { stack: rawError?.stack }),
  });
};
