// Runs before every test file: deterministic env, quiet logs, no real database.
Object.assign(process.env, {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  MONGODB_URI: "mongodb://127.0.0.1:27017/test",
  JWT_ACCESS_SECRET: "a".repeat(40),
  JWT_REFRESH_SECRET: "b".repeat(40),
});
