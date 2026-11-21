import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { API_PREFIX } from "./config/constants.js";
import { logger } from "./utils/logger.js";
import { ApiError } from "./utils/ApiError.js";
import { apiLimiter } from "./middlewares/rateLimiter.js";
import { notFound } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import routes from "./routes/index.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (env.isProd) app.set("trust proxy", 1); // correct client IPs behind a load balancer

 app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        "https://mentor-intern-platform.netlify.app",
        "http://localhost:3000",
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(
          ApiError.forbidden("Origin not allowed", {
            code: "CORS_BLOCKED",
          }),
        );
      }
    },
    credentials: true,
  }),
);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        !origin || env.CLIENT_URLS.includes(origin) || "https://mentor-intern-platform.netlify.app/"
          ? callback(null, true)
          : callback(ApiError.forbidden("Origin not allowed", { code: "CORS_BLOCKED" })),
      credentials: true, // required for the httpOnly refresh-token cookie
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());

  app.use(API_PREFIX, apiLimiter, routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
