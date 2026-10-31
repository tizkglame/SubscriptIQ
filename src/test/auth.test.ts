import { beforeEach, describe, expect, it, vi } from "vitest";
import { guard, homeFor, loadSession } from "@/lib/auth";
import { brokeredPreviewStorage } from "@/integrations/supabase/previewAuthStorage";

const { getUser, roleQuery } = vi.hoisted(() => ({ getUser: vi.fn(), roleQuery: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser },
    from: () => ({ select: () => ({ eq: roleQuery }) }),
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
});

describe("session roles and guards", () => {
  it("requires a verified user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await loadSession()).toBeNull();
    expect(roleQuery).not.toHaveBeenCalled();
  });
  it.each([
    [[{ role: "customer" }], "customer"],
    [[{ role: "staff" }, { role: "admin" }], "admin"],
    [[{ role: "staff" }], "staff"],
    [[], "customer"],
  ])("resolves role priority for %j", async (roles, expected) => {
    getUser.mockResolvedValue({ data: { user: { id: "user" } } });
    roleQuery.mockResolvedValue({ data: roles, error: null });
    expect((await loadSession())?.role).toBe(expected);
  });
  it("propagates role lookup failures instead of silently changing account type", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user" } } });
    roleQuery.mockResolvedValue({ data: null, error: new Error("Database unavailable") });
    await expect(loadSession()).rejects.toThrow("Database unavailable");
  });
  it("redirects unauthorized roles to their home", () => {
    expect(() => guard(["admin"])({ context: { role: "staff" } })).toThrow();
    expect(() => guard(["admin", "staff"])({ context: { role: "customer" } })).toThrow();
    expect(() => guard(["admin"])({ context: { role: "admin" } })).not.toThrow();
    expect(homeFor("customer")).toBe("/portal");
  });
});

it("keeps auth storage functional when the browser denies localStorage", async () => {
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Denied", "SecurityError");
  });
  try {
    const storage = brokeredPreviewStorage()!;
    expect(await storage.getItem("session")).toBeNull();
    await storage.setItem("session", "example-session");
    expect(await storage.getItem("session")).toBe("example-session");
    await storage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
  } finally {
    get.mockRestore();
  }
});
