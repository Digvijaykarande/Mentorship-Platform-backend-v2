import bcrypt from "bcryptjs";

const COST = 12;

export const hashPassword = (plain) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Used to burn the same CPU time when the email is unknown, so login timing doesn't reveal accounts.
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", COST);
