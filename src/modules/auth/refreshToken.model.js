import mongoose from "../../config/mongoose.js";

const { Schema } = mongoose;

/**
 * One row per issued refresh token. Tokens rotate on every use; all tokens that descend from the
 * same login share a `family`, so replaying an already-used token revokes the whole family.
 */
const refreshTokenSchema = new Schema(
  {
    jti: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true },
    // "Remember me": persistent cookie vs. session cookie. Kept across rotations.
    persistent: { type: Boolean, default: true },
    revokedAt: Date,
    replacedBy: String,
    userAgent: { type: String, maxlength: 300 },
    ip: String,
  },
  { timestamps: true },
);

// MongoDB removes expired rows automatically.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
