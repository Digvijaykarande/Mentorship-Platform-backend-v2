import { ApiError } from "../utils/ApiError.js";

/**
 * Validates req.body / req.query / req.params against Zod schemas.
 *   router.post("/", validate({ body: createSchema }), controller)
 * Parsed (coerced, stripped) values replace the originals; Express 5's req.query is read-only,
 * so parsed query lives on req.validated.query.
 */
export const validate = (schemas) => (req, _res, next) => {
  const errors = [];
  req.validated = {};

  for (const key of ["params", "query", "body"]) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key]);
    if (!result.success) {
      errors.push(
        ...result.error.issues.map((issue) => ({
          in: key,
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
    } else {
      req.validated[key] = result.data;
      if (key === "body") req.body = result.data;
    }
  }

  if (errors.length) {
    return next(
      ApiError.unprocessable(errors[0].message, { code: "VALIDATION_ERROR", details: errors }),
    );
  }
  return next();
};
