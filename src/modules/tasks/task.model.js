import mongoose from "../../config/mongoose.js";
import {
  PRIORITY,
  PRIORITY_VALUES,
  TASK_STATUS,
  TASK_STATUS_VALUES,
} from "../../config/constants.js";

const { Schema } = mongoose;
const str = (max = 200) => ({ type: String, trim: true, maxlength: max });

/**
 * Steps are ordered. Step N unlocks only once step N-1 is done AND approved.
 *   done=false                      -> "current" (first such step) or "locked"
 *   done=true,  approved=false      -> "review"  (waiting on a mentor)
 *   done=true,  approved=true       -> "done"
 * `changesRequested` marks a step the mentor sent back (done is reset to false).
 */
const stepSchema = new Schema(
  {
    text: { ...str(300), required: true },
    done: { type: Boolean, default: false },
    approved: { type: Boolean, default: false },
    changesRequested: { type: Boolean, default: false },
    reviewNote: str(1000),
    submission: { type: Schema.Types.ObjectId, ref: "Submission" },
    completedAt: Date,
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    // Set when the step was created from a mentor's improvement suggestion.
    sourceFeedback: { type: Schema.Types.ObjectId, ref: "Feedback" },
    suggestionIndex: Number,
  },
  { timestamps: true },
);

const taskResourceSchema = new Schema(
  {
    name: str(160),
    url: str(600),
    type: str(60),
    publicId: str(300),
    size: { type: Number, min: 0 },
    mimeType: str(100),
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const taskSchema = new Schema(
  {
    code: { type: String, unique: true, index: true }, // TASK-1001
    title: { ...str(200), required: [true, "Task title is required"] },
    project: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    assignees: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
    instructions: str(4000),
    priority: { type: String, enum: PRIORITY_VALUES, default: PRIORITY.MEDIUM },
    dueDate: Date,
    // Denormalised from steps (see taskSteps.js) so lists can filter/sort without computing.
    status: { type: String, enum: TASK_STATUS_VALUES, default: TASK_STATUS.TODO, index: true },
    steps: { type: [stepSchema], default: [] },
    resources: { type: [taskResourceSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

taskSchema.index({ assignees: 1, status: 1 });
taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ dueDate: 1, status: 1 });
taskSchema.index({ title: "text" });

export const Task = mongoose.model("Task", taskSchema);
