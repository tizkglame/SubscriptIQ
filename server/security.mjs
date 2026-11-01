import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "subscriptiq_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, salt, hex] = (stored ?? "").split(":");
  // Unknown accounts still perform the same password derivation.
  const key = await scrypt(password, salt || "00000000000000000000000000000000", 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  const expected = Buffer.from(hex ?? "", "hex");
  return algorithm === "scrypt" && expected.length === key.length && timingSafeEqual(expected, key);
}

export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function readToken(request) {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const value = cookie?.slice(SESSION_COOKIE.length + 1);
  return value && /^[a-zA-Z0-9_-]{43}$/.test(value) ? value : null;
}
export function sessionCookie(token, secure = false) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? "; Secure" : ""}`;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
