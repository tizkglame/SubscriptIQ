import { redirect } from "@tanstack/react-router";
import { getSession } from "./api";

export type Role = "admin" | "staff" | "customer";
export const loadSession = getSession;
export const homeFor = (role: Role) => (role === "customer" ? "/portal" : "/dashboard");

export function guard(allowed: Role[]) {
  return ({ context }: { context: { role: Role } }) => {
    if (!allowed.includes(context.role)) throw redirect({ to: homeFor(context.role) });
  };
}
