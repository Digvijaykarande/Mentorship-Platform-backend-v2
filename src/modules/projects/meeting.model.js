import mongoose from "../../config/mongoose.js";

const { Schema } = mongoose;

const meetingSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    intern: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    mentor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true },
    timeSlot: { type: String, required: true, trim: true, maxlength: 40 },
    agenda: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ["requested", "confirmed", "cancelled", "completed"],
      default: "requested",
    },
  },
  { timestamps: true },
);

meetingSchema.index({ mentor: 1, date: 1 });

export const Meeting = mongoose.model("Meeting", meetingSchema);
