import mongoose from "../../config/mongoose.js";

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // counter key, e.g. "submission"
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model("Counter", counterSchema);

/**
 * Atomic, gap-free-enough human readable codes: nextCode("submission", "SUB") -> "SUB-1001".
 * `start` offsets the first number so codes look like the ones in the UI (SUB-1048 ...).
 */
export async function nextCode(key, prefix, { start = 1000, pad = 0 } = {}) {
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  const number = String(start + counter.seq).padStart(pad, "0");
  return `${prefix}-${number}`;
}
