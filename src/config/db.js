import mongoose from "./mongoose.js";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STATES = ["disconnected", "connected", "connecting", "disconnecting"];
export const dbStatus = () => STATES[mongoose.connection.readyState] ?? "unknown";
export const isDbConnected = () => mongoose.connection.readyState === 1;

let listenersAttached = false;
function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  const { connection } = mongoose;
  connection.on("connected", () => logger.info({ db: connection.name }, "MongoDB connected"));
  connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  connection.on("error", (err) => logger.error({ err }, "MongoDB connection error"));
}

/**
 * Connects to MongoDB Atlas. Retries the *initial* connection with exponential backoff;
 * after that the driver reconnects automatically on its own.
 */
export async function connectDB() {
  attachListeners();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB_NAME,
        maxPoolSize: 20,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
        // Build indexes automatically only in development; in production run migrations/`syncIndexes`.
        autoIndex: !env.isProd,
      });
      return mongoose.connection;
    } catch (err) {
      logger.error(
        { err: err.message, attempt, maxAttempts: MAX_ATTEMPTS },
        "MongoDB initial connection failed",
      );
      if (attempt === MAX_ATTEMPTS) throw err;
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  logger.info("MongoDB connection closed");
}
