/**
 * Creates (or promotes) an admin account.
 *   ADMIN_PASSWORD='...' npm run create-admin -- admin@loyanox.com "Admin Name"
 * The password is read from the environment so it does not end up in shell history.
 */
import { connectDB, disconnectDB } from "../src/config/db.js";
import { ROLES, USER_STATUS } from "../src/config/constants.js";
import { User } from "../src/modules/users/user.model.js";
import { nextCode } from "../src/modules/common/counter.model.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { emailField, passwordField } from "../src/modules/users/user.schema.js";

const [rawEmail, name = "Admin"] = process.argv.slice(2);
const rawPassword = process.env.ADMIN_PASSWORD;

if (!rawEmail || !rawPassword) {
  console.error(
    "Usage: ADMIN_PASSWORD='<password>' npm run create-admin -- <email> [\"Full Name\"]",
  );
  process.exit(1);
}

const email = emailField.safeParse(rawEmail);
const password = passwordField.safeParse(rawPassword);
if (!email.success || !password.success) {
  console.error(`Invalid input: ${(email.error ?? password.error).issues[0].message}`);
  process.exit(1);
}

try {
  await connectDB();
  const existing = await User.findOne({ email: email.data });
  if (existing) {
    existing.set({
      role: ROLES.ADMIN,
      isApproved: true,
      isActive: true,
      passwordHash: await hashPassword(password.data),
    });
    if (!existing.code?.startsWith("ADM-"))
      existing.code = await nextCode("user-admin", "ADM", { start: 0, pad: 3 });
    await existing.save();
    console.log(`Promoted existing account to admin: ${existing.email} (${existing.code})`);
  } else {
    const admin = await User.create({
      name,
      email: email.data,
      passwordHash: await hashPassword(password.data),
      role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
      code: await nextCode("user-admin", "ADM", { start: 0, pad: 3 }),
      profile: { firstName: name.split(" ")[0], lastName: name.split(" ").slice(1).join(" ") },
    });
    console.log(`Admin created: ${admin.email} (${admin.code})`);
  }
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
