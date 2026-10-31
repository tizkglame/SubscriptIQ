import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { email: string; fullName: string; password: string; role: "staff" | "admin" }) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        fullName: z.string().trim().min(1).max(100),
        password: z
          .string()
          .min(8)
          .max(72)
          .refine(
            (value) => new TextEncoder().encode(value).length <= 72,
            "Password must be at most 72 bytes",
          ),
        role: z.enum(["staff", "admin"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Only admins can create staff");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);
    if (!created.user) throw new Error("Account creation did not return a user");
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user!.id, role: data.role });
    if (rErr) {
      const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(created.user!.id);
      if (cleanupError) console.error("Failed to roll back staff provisioning", cleanupError);
      throw new Error("Could not assign the team role. Please contact an administrator.");
    }
    return { id: created.user!.id };
  });
