import mongoose from "../../config/mongoose.js";

const { Schema } = mongoose;

/** Audit/activity feed shown on the admin overview. */
const activitySchema = new Schema(
  {
    type: { type: String, required: true, trim: true, maxlength: 60 }, // project-created, task-assigned ...
    title: { type: String, required: true, trim: true, maxlength: 200 },
    detail: { type: String, trim: true, maxlength: 400 },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    task: { type: Schema.Types.ObjectId, ref: "Task" },
    submission: { type: Schema.Types.ObjectId, ref: "Submission" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ createdAt: -1 });
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const Activity = mongoose.model("Activity", activitySchema);
