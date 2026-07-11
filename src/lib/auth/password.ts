import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Hashea una contraseña en texto plano para guardarla en `User.passwordHash`. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compara una contraseña en texto plano contra el hash guardado. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
