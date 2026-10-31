import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "staff" | "customer";

export async function loadSession() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
  const list = (roles ?? []).map((r) => r.role as Role);
  const role: Role = list.includes("admin") ? "admin" : list.includes("staff") ? "staff" : "customer";
  return { user: data.user, role };
}

export const homeFor = (role: Role) => (role === "customer" ? "/portal" : "/dashboard");

import { redirect } from "@tanstack/react-router";
export function guard(allowed: Role[]) {
  return ({ context }: { context: { role: Role } }) => {
    if (!allowed.includes(context.role)) throw redirect({ to: homeFor(context.role) });
  };
}
