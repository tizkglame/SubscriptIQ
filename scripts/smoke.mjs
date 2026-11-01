import assert from "node:assert/strict";

// Read-only checks apart from temporary login sessions, which are signed out.
const base = process.env.APP_URL ?? "http://localhost:3000";
async function call(path, data, cookie) {
  const response = await fetch(`${base}/api${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(result)}`);
  return { response, result };
}

assert.equal((await call("/health")).result.status, "ok");
const page = await fetch(base);
assert.equal(page.status, 200);
assert.match(await page.text(), /id="root"/);
for (const role of ["admin", "staff", "customer"]) {
  const login = await call("/auth/login", {
    email: `${role}@subscriptiq.local`,
    password: "LocalDemo123!",
  });
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  try {
    assert.equal((await call("/auth/session", undefined, cookie)).result.role, role);
    const { result } = await call("/query", { table: "customers" }, cookie);
    assert.ok(result.length > 0);
    if (role === "customer") assert.equal(result.length, 1);
    console.log(`${role}: signed in and read ${result.length} permitted customer account(s)`);
  } finally {
    await call("/auth/logout", {}, cookie);
  }
}
console.log(`SubscriptIQ is healthy at ${base}.`);
