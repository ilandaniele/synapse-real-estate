import bcrypt from "bcryptjs";

const BCRYPT_COST = 10;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** Compared against when the account is unknown so every failed sign-in costs one bcrypt verification. */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);
