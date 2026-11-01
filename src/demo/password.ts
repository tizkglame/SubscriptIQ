const ITERATIONS = 100000;
const encode = (bytes: Uint8Array) =>
  [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");

async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
      key,
      256,
    ),
  );
}

// These are preview accounts in a visitor-owned database, not hosted identity
// verification. Never use browser-only authentication to protect shared data.
export async function hashDemoPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2:${encode(salt)}:${encode(await derive(password, salt))}`;
}

export async function verifyDemoPassword(password: string, stored: string) {
  const [algorithm, salt, expected] = stored.split(":");
  if (algorithm !== "pbkdf2" || !salt || !/^[a-f0-9]{32}$/.test(salt)) return false;
  const bytes = Uint8Array.from(salt.match(/../g)!, (value) => parseInt(value, 16));
  return encode(await derive(password, bytes)) === expected;
}
