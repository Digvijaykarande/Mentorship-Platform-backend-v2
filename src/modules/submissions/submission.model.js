import mongoose from "../../config/mongoose.js";
import {
  SUBMISSION_STATUS,
  SUBMISSION_STATUS_VALUES,
  SUBMISSION_TYPE_VALUES,
} from "../../config/constants.js";

const { Schema } = mongoose;
const str = (max = 300) => ({ type: String, trim: true, maxlength: max });

const fileSchema = new Schema(
  {
    name: { ...str(200), required: true },
    url: { ...str(600), required: true },
    publicId: str(300),
    size: { type: Number, min: 0 },
    mimeType: str(100),
  },
  { _id: false },
);

/** Snapshot per version so an old version can be shown (and restored) later. */
const versionSchema = new Schema(
  {
    version: { type: String, required: true }, // v1.2.0
    status: { type: String, enum: SUBMISSION_STATUS_VALUES },
    kind: { type: String, enum: ["initial", "major", "minor", "patch"], required: true },
    changes: str(500),
  },
  { timestamps: { createdAt: "date", updatedAt: false } },
);

const reviewSchema = new Schema(
  {
    status: { type: String, enum: SUBMISSION_STATUS_VALUES, required: true },
    note: str(2000),
    rating: Number,
    reviewer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: "date", updatedAt: false } },
);

const submissionSchema = new Schema(
  {
    code: { type: String, unique: true, index: true }, // SUB-1001
    title: { ...str(200), required: [true, "Title is required"] },
    type: { type: String, enum: SUBMISSION_TYPE_VALUES, required: true },
    status: {
      type: String,
      enum: SUBMISSION_STATUS_VALUES,
      default: SUBMISSION_STATUS.PENDING,
      index: true,
    },
    version: { type: String, default: "v1.0.0" },

    intern: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    task: { type: Schema.Types.ObjectId, ref: "Task", index: true },
    stepId: { type: Schema.Types.ObjectId }, // _id of the linked step inside task.steps

    description: str(2000),
    notes: str(2000),
    files: { type: [fileSchema], default: [] },
    github: str(600), // Source Code
    link: str(600), // Documentation / Design / QA
    live: str(600),

    feedback: str(2000), // latest reviewer note shown to the intern
    reviewedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    // Kept while withdrawn so "restore" can bring back exactly what was there before.
    prevStatus: { type: String, enum: SUBMISSION_STATUS_VALUES },
    prevFeedback: str(2000),
    reviews: { type: [reviewSchema], default: [] },
    versions: { type: [versionSchema], default: [] }, // newest first
  },
  { timestamps: true },
);

submissionSchema.index({ intern: 1, status: 1, createdAt: -1 });
submissionSchema.index({ status: 1, createdAt: -1 });
submissionSchema.index({ task: 1, stepId: 1 });
submissionSchema.index({ title: "text", description: "text" });

export const Submission = mongoose.model("Submission", submissionSchema);
