import mongoose from "../../config/mongoose.js";
import { PROVIDER_IDS, PROVIDERS } from "./providers.js";

const { Schema } = mongoose;
const str = (max = 300) => ({ type: String, trim: true, maxlength: max });

/**
 * One document for the whole app: which storage new uploads go to, plus the saved Google Drive
 * connection. Secrets are encrypted (see crypto.js) and `select: false`, so they only load when asked for.
 * Cloudinary keeps using the server's CLOUDINARY_* environment variables.
 */
const gdriveSchema = new Schema(
  {
    status: { type: String, enum: ["none", "pending", "connected", "needs_reauth"], default: "none" },
    clientId: str(300),
    clientSecretEnc: { ...str(2000), select: false },
    refreshTokenEnc: { ...str(4000), select: false },
    account: {
      type: new Schema({ id: str(100), name: str(200), email: str(254), picture: str(1000) }, { _id: false }),
      default: undefined,
    },
    rootFolderId: str(100),
    rootFolderName: str(200),
    connectedAt: Date,
    connectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastError: str(500),
    lastCheckedAt: Date,
  },
  { _id: false },
);

const settingsSchema = new Schema(
  {
    key: { type: String, unique: true, default: "global" },
    activeProvider: { type: String, enum: PROVIDER_IDS, default: PROVIDERS.CLOUDINARY },
    gdrive: { type: gdriveSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export const StorageSettings = mongoose.model("StorageSettings", settingsSchema);
