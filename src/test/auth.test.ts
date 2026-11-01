import { beforeEach, describe, expect, it, vi } from "vitest";
import { guard, homeFor, loadSession } from "@/lib/auth";
import { api, signIn, signOut } from "@/lib/api";

beforeEach(() => {
  vi.restoreAllMocks();
});
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("local sessions and guards", () => {
  it("returns null without an active cookie session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(null)));
    expect(await loadSession()).toBeNull();
  });
  it.each(["admin", "staff", "customer"])("uses the server-verified %s role", async (role) => {
    const session = { user: { id: "id", email: "a@example.test" }, role };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(session)));
    expect(await loadSession()).toEqual(session);
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ credentials: "same-origin", method: "GET" }),
    );
  });
  it("propagates database failures instead of changing account type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ error: { message: "Database unavailable" } }, 500)),
    );
    await expect(loadSession()).rejects.toThrow("Database unavailable");
  });
  it("signs in and out without browser token storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response({ ok: true }))),
    );
    const storage = vi.spyOn(Storage.prototype, "setItem");
    await signIn("admin@subscriptiq.local", "LocalDemo123!");
    await signOut();
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
    expect(storage).not.toHaveBeenCalled();
  });
  it("reports invalid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ error: { message: "Invalid email or password" } }, 401)),
    );
    await expect(api("/auth/login", {})).rejects.toThrow("Invalid email or password");
  });
  it("redirects unauthorized roles to their home", () => {
    expect(() => guard(["admin"])({ context: { role: "staff" } })).toThrow();
    expect(() => guard(["admin", "staff"])({ context: { role: "customer" } })).toThrow();
    expect(() => guard(["admin"])({ context: { role: "admin" } })).not.toThrow();
    expect(homeFor("customer")).toBe("/portal");
  });
});
