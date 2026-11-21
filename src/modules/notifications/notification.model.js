import mongoose from "../../config/mongoose.js";
import { NOTIFICATION_ACCENTS } from "../../config/constants.js";

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, trim: true, maxlength: 60, default: "general" }, // submission-approved, task-assigned ...
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 500 },
    category: { type: String, trim: true, maxlength: 60 }, // Mentor activity, Assessment ...
    accent: { type: String, enum: NOTIFICATION_ACCENTS, default: "blue" },
    actionLabel: { type: String, trim: true, maxlength: 40 },
    link: { type: String, trim: true, maxlength: 300 }, // in-app route to open
    unread: { type: Boolean, default: true },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, unread: 1 });
// Old notifications clean themselves up after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Notification = mongoose.model("Notification", notificationSchema);
