import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DEMO: Record<"admin" | "staff" | "customer", { email: string; name: string }> = {
  admin: { email: "admin@brightloop.demo", name: "Avery Admin" },
  staff: { email: "staff@brightloop.demo", name: "Sam Staff" },
  customer: { email: "customer@brightloop.demo", name: "Demo Customer" },
};
export const DEMO_PASSWORD = "Brightloop!2026";

/** Ensures the fixed demo account for a role exists, so the client can sign in with it. */
export const ensureDemoUser = createServerFn({ method: "POST" })
  .inputValidator((i: { role: "admin" | "staff" | "customer" }) => z.object({ role: z.enum(["admin", "staff", "customer"]) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = DEMO[data.role];
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = list?.users.find((u) => u.email === d.email);
    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: d.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: d.name },
      });
      if (error) throw new Error(error.message);
      user = created.user!;
    }
    await supabaseAdmin.from("user_roles").upsert({ user_id: user.id, role: data.role }, { onConflict: "user_id,role" });
    if (data.role === "customer") {
      await supabaseAdmin.from("customers").update({ user_id: user.id }).eq("email", d.email).is("user_id", null);
    }
    return { email: d.email };
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { email: string; fullName: string; password: string; role: "staff" | "admin" }) =>
    z.object({
      email: z.string().trim().email().max(255),
      fullName: z.string().trim().min(1).max(100),
      password: z.string().min(8).max(72),
      role: z.enum(["staff", "admin"]),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can create staff");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true, user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: created.user!.id, role: data.role });
    if (rErr) throw new Error(rErr.message);
    return { id: created.user!.id };
  });
