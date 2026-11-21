/**
 * Builds every MongoDB index (unique email/code, TTL cleanup, query indexes).
 * Production runs with autoIndex off, so run this ONCE after the first deploy and after any schema change:
 *   npm run sync-indexes
 */
import { connectDB, disconnectDB } from "../src/config/db.js";
import mongoose from "../src/config/mongoose.js";
import "../src/modules/users/user.model.js";
import "../src/modules/auth/refreshToken.model.js";
import "../src/modules/projects/project.model.js";
import "../src/modules/projects/meeting.model.js";
import "../src/modules/tasks/task.model.js";
import "../src/modules/submissions/submission.model.js";
import "../src/modules/feedback/feedback.model.js";
import "../src/modules/notifications/notification.model.js";
import "../src/modules/admin/activity.model.js";
import "../src/modules/storage/storageSettings.model.js";
import "../src/modules/common/counter.model.js";

try {
  await connectDB();
  for (const name of mongoose.modelNames()) {
    await mongoose.model(name).syncIndexes();
    console.log(`indexes ready: ${name}`);
  }
} catch (err) {
  console.error("Index sync failed:", err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
