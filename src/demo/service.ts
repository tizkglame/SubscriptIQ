import type { PGliteInterface } from "@electric-sql/pglite";
import { z } from "zod";
import { ApiError } from "../../shared/errors.mjs";
import { executeQuery, executeRpc } from "../../shared/query.mjs";
import type { Session } from "@/lib/api";
import { createBrowserSql } from "./adapter";
import { hashDemoPassword, verifyDemoPassword } from "./password";

const credentials = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(1).max(128),
  })
  .strict();
const account = credentials.extend({
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(100),
  role: z.enum(["admin", "staff"]),
});
const portal = z.object({ customerId: z.uuid(), password: z.string().min(8).max(128) }).strict();

export function createDemoService(database: PGliteInterface) {
  const sql = createBrowserSql(database);
  async function session(): Promise<Session | null> {
    const {
      rows: [row],
    } = await database.query<{
      id: string;
      email: string;
      full_name: string;
      role: Session["role"];
    }>(`SELECT u.id, u.email, u.full_name,
      (SELECT role FROM public.user_roles WHERE user_id = u.id ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END LIMIT 1) AS role
      FROM private.browser_state s JOIN private.users u ON u.id = s.user_id WHERE s.id = true`);
    return row
      ? {
          user: { id: row.id, email: row.email, full_name: row.full_name },
          role: row.role ?? "customer",
        }
      : null;
  }
  return async function request(path: string, body?: unknown) {
    try {
      if (path === "/auth/session") return session();
      if (path === "/auth/login") {
        const data = credentials.parse(body);
        const {
          rows: [user],
        } = await database.query<{ id: string; password_hash: string }>(
          "SELECT id, password_hash FROM private.users WHERE email = $1",
          [data.email],
        );
        if (!user || !(await verifyDemoPassword(data.password, user.password_hash)))
          throw new ApiError(401, "Invalid email or password");
        await database.query(
          "INSERT INTO private.browser_state(id, user_id) VALUES (true, $1) ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id",
          [user.id],
        );
        return { ok: true };
      }
      if (path === "/auth/logout") {
        await database.exec("DELETE FROM private.browser_state");
        return { ok: true };
      }
      const current = await session();
      if (!current) throw new ApiError(401, "Please sign in");
      if (path === "/query") return await executeQuery(sql, current, body);
      if (path === "/rpc") return await executeRpc(sql, current, body);
      if (path === "/accounts" || path === "/customer-accounts") {
        if (current.role !== "admin") throw new ApiError(403, "Only admins can create accounts");
        const passwordHash = await hashDemoPassword(
          (path === "/accounts" ? account.parse(body) : portal.parse(body)).password,
        );
        return await database.transaction(async (tx) => {
          let email: string,
            name: string,
            role: "admin" | "staff" | "customer",
            customerId: string | undefined;
          if (path === "/customer-accounts") {
            const data = portal.parse(body);
            const {
              rows: [customer],
            } = await tx.query<{ id: string; user_id: string | null; email: string; name: string }>(
              "SELECT id, user_id, email, name FROM public.customers WHERE id = $1 FOR UPDATE",
              [data.customerId],
            );
            if (!customer) throw new ApiError(404, "Customer not found");
            if (customer.user_id)
              throw new ApiError(409, "This customer already has portal access");
            email = customer.email.trim().toLowerCase();
            name = customer.name;
            role = "customer";
            customerId = customer.id;
          } else {
            const data = account.parse(body);
            email = data.email;
            name = data.fullName;
            role = data.role;
          }
          const {
            rows: [user],
          } = await tx.query<{ id: string }>(
            "INSERT INTO private.users(email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id",
            [email, name, passwordHash],
          );
          await tx.query("INSERT INTO public.user_roles(user_id, role) VALUES ($1, $2)", [
            user!.id,
            role,
          ]);
          if (customerId)
            await tx.query("UPDATE public.customers SET user_id = $1 WHERE id = $2", [
              user!.id,
              customerId,
            ]);
          return { id: user!.id };
        });
      }
      throw new ApiError(404, "Unknown demo action");
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new ApiError(400, error.issues[0]?.message ?? "Invalid input");
      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "23505")
          throw new ApiError(409, "A record with this email or value already exists.");
        if (error.code === "23503")
          throw new ApiError(400, "This record is in use or references a missing record.");
        if (error.code === "42501")
          throw new ApiError(403, "You don't have permission for this action.");
      }
      throw error;
    }
  };
}
