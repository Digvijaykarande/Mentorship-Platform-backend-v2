import { ApiError } from "../../utils/ApiError.js";
import { Activity } from "../admin/activity.model.js";
import { logActivity, serializeActivity } from "../admin/activity.service.js";
import { User } from "../users/user.model.js";
import { formatBytes } from "../uploads/usage.service.js";
import { cloudinaryStatus } from "./cloudinary.service.js";
import { disconnectDrive, driveStatus } from "./google.service.js";
import { PROVIDERS, PROVIDER_IDS } from "./providers.js";
import { usageByProvider } from "./providerUsage.js";
import { forgetActiveProvider, isCloudinaryConfigured, loadSettings, patchSettings } from "./settings.service.js";

export const PROVIDER_LABELS = { [PROVIDERS.CLOUDINARY]: "Cloudinary", [PROVIDERS.GDRIVE]: "Google Drive" };

/** One screen of data for Admin > Storage: both providers, live account details, and what is stored where. */
export async function storageOverview({ refresh = false } = {}) {
  const [settings, cloudinary, drive, stored, recent] = await Promise.all([
    loadSettings(),
    cloudinaryStatus({ refresh }),
    driveStatus({ refresh }),
    usageByProvider(),
    Activity.find({ type: { $regex: "^storage-" } }).sort({ createdAt: -1 }).limit(8).populate("actor", "name").lean(),
  ]);

  const connector = drive.connectedBy ? await User.findById(drive.connectedBy).select("name").lean() : null;
  const withStored = (p) => ({
    ...p,
    label: PROVIDER_LABELS[p.id],
    active: settings.activeProvider === p.id,
    stored: { ...stored[p.id], readable: formatBytes(stored[p.id].bytes) },
  });

  return {
    activeProvider: settings.activeProvider,
    providers: [withStored(cloudinary), withStored({ ...drive, connectedByName: connector?.name ?? null })],
    totals: {
      bytes: PROVIDER_IDS.reduce((s, p) => s + stored[p].bytes, 0),
      files: PROVIDER_IDS.reduce((s, p) => s + stored[p].files, 0),
    },
    changes: recent.map(serializeActivity),
  };
}

/** Choose where new uploads go. Files already uploaded stay where they are and keep working. */
export async function setActiveProvider(admin, provider) {
  if (provider === PROVIDERS.CLOUDINARY && !isCloudinaryConfigured()) {
    throw ApiError.badRequest("Cloudinary is not configured on the server (CLOUDINARY_* variables).", { code: "PROVIDER_NOT_READY" });
  }
  if (provider === PROVIDERS.GDRIVE) {
    const drive = await driveStatus();
    if (drive.status !== "connected") {
      throw ApiError.badRequest("Connect Google Drive before using it for uploads.", { code: "PROVIDER_NOT_READY" });
    }
  }
  const before = (await loadSettings()).activeProvider;
  if (before === provider) return { activeProvider: provider };
  await patchSettings({ activeProvider: provider });
  forgetActiveProvider();
  await logActivity({
    type: "storage-provider-changed",
    title: `New uploads now go to ${PROVIDER_LABELS[provider]}`,
    detail: `Switched from ${PROVIDER_LABELS[before]}. Existing files stay where they are.`,
    actor: admin,
  });
  return { activeProvider: provider };
}

export const disconnectProvider = async (admin, provider) => {
  if (provider !== PROVIDERS.GDRIVE) throw ApiError.badRequest("Only Google Drive can be disconnected here.");
  await disconnectDrive(admin);
  return { id: provider };
};
