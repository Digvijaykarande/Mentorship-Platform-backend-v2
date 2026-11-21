import mongoose from "../../config/mongoose.js";
import { FEEDBACK_STATUS, FEEDBACK_STATUS_VALUES } from "../../config/constants.js";

const { Schema } = mongoose;
const str = (max = 300) => ({ type: String, trim: true, maxlength: max });
const list = () => ({ type: [{ type: String, trim: true, maxlength: 500 }], default: [] });

const feedbackSchema = new Schema(
  {
    code: { type: String, unique: true, index: true }, // FB-1001
    title: { ...str(200), required: [true, "Title is required"] },
    category: { ...str(60), default: "General Review" },
    status: {
      type: String,
      enum: FEEDBACK_STATUS_VALUES,
      default: FEEDBACK_STATUS.RESOLVED,
      index: true,
    },
    rating: { type: Number, min: 0, max: 5 },

    mentor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    mentee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    task: { type: Schema.Types.ObjectId, ref: "Task" },
    submission: { type: Schema.Types.ObjectId, ref: "Submission" },

    summary: str(2000),
    strengths: list(),
    improvements: list(),
    // Indexes of `improvements` the intern already turned into task steps.
    addedSuggestionIds: { type: [Number], default: [] },

    // An intern-initiated request that the mentor has not answered yet.
    isRequest: { type: Boolean, default: false },
    respondedAt: Date,
  },
  { timestamps: true },
);

feedbackSchema.index({ mentee: 1, createdAt: -1 });
feedbackSchema.index({ mentor: 1, status: 1, createdAt: -1 });
feedbackSchema.index({ title: "text", summary: "text" });

export const Feedback = mongoose.model("Feedback", feedbackSchema);
