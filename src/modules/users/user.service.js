import { User } from "./user.model.js";
import { ApiError } from "../../utils/ApiError.js";

const PROFILE_KEYS = [
  "firstName",
  "lastName",
  "username",
  "dob",
  "gender",
  "phone",
  "location",
  "address",
  "headline",
  "company",
  "bio",
  "careerInterests",
  "areasOfInterest",
  "professionalGoals",
  "linkedin",
  "github",
  "portfolio",
  "website",
  "otherLinks",
];

export async function getById(id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

/** Partial update using dot-paths, so fields that were not sent are never overwritten. */
export async function updateProfile(userId, input) {
  const $set = {};
  for (const key of PROFILE_KEYS) {
    if (input[key] !== undefined) $set[`profile.${key}`] = input[key];
  }
  if (input.skills !== undefined) $set.skills = [...new Set(input.skills)];
  const $unset = {};
  if (input.avatar) $set.avatar = input.avatar;
  else if (input.avatar === null) $unset.avatar = 1;

  if (input.firstName !== undefined || input.lastName !== undefined) {
    const current = await getById(userId);
    const first = input.firstName ?? current.profile?.firstName ?? "";
    const last = input.lastName ?? current.profile?.lastName ?? "";
    const full = `${first} ${last}`.trim();
    if (full) $set.name = full;
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) return getById(userId);
  const user = await User.findByIdAndUpdate(
    userId,
    { ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) },
    { returnDocument: "after", runValidators: true },
  );
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function updateSettings(userId, input) {
  const user = await getById(userId);
  for (const key of ["language", "compactSidebar", "twoFactor"]) {
    if (input[key] !== undefined) user.settings[key] = input[key];
  }
  for (const [name, value] of Object.entries(input.notifications ?? {})) {
    // Map keys cannot contain "." or start with "$".
    if (/^[\w-]+$/.test(name)) user.settings.notifications.set(name, value);
  }
  await user.save();
  return user;
}

/**
 * "Delete my account": the account is deactivated (never erased) so tasks, submissions and feedback
 * other people rely on keep their history. Admins cannot do this to themselves, which prevents
 * locking an organisation out of its own administration.
 */
export async function deactivateSelf(user) {
  if (user.role === "admin") {
    throw ApiError.conflict("Administrator accounts cannot be deleted here. Ask another administrator.", {
      code: "ADMIN_SELF_DELETE",
    });
  }
  await User.updateOne({ _id: user._id }, { $set: { isActive: false, status: "Inactive" } });
}
