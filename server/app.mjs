import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { executeQuery, executeRpc } from "./query.mjs";
import {
  ApiError,
  hashPassword,
  verifyPassword,
  hashToken,
  newToken,
  readToken,
  sessionCookie,
  SESSION_SECONDS,
} from "./security.mjs";

const credentials = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(1).max(128),
  })
  .strict();
const passwordSchema = z.string().min(8).max(128);
const accountSchema = z
  .object({
    email: credentials.shape.email,
    fullName: z.string().trim().min(1).max(100),
    password: passwordSchema,
    role: z.enum(["staff", "admin"]),
  })
  .strict();
const customerAccountSchema = z.object({ customerId: z.uuid(), password: passwordSchema }).strict();
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}
async function body(request) {
  if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json")
    throw new ApiError(415, "Use application/json");
  let size = 0;
  const chunks = [];
  let tooLarge = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 102400) tooLarge = true;
    else chunks.push(chunk);
  }
  if (tooLarge) throw new ApiError(413, "Request is too large");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "Invalid JSON request");
  }
}

export function createApplication({
  sql,
  distDirectory = new URL("../dist/", import.meta.url),
  secureCookies = process.env.COOKIE_SECURE === "true",
}) {
  const dist = path.resolve(
    distDirectory instanceof URL ? fileURLToPath(distDirectory) : distDirectory,
  );
  const failedLogins = new Map();

  async function session(request) {
    const token = readToken(request);
    if (!token) return null;
    const [row] = await sql`SELECT u.id, u.email, u.full_name,
      (SELECT role FROM public.user_roles WHERE user_id = u.id
        ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END LIMIT 1) AS role
      FROM private.sessions s JOIN private.users u ON u.id = s.user_id
      WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;
    if (!row) return null;
    return {
      user: { id: row.id, email: row.email, full_name: row.full_name },
      role: row.role ?? "customer",
    };
  }

  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    try {
      const url = new URL(request.url, "http://localhost");
      const route = url.pathname;
      if (route.startsWith("/api/")) {
        if (request.method === "POST") {
          const origin = request.headers.origin;
          if (
            !origin ||
            new URL(origin).host !== request.headers.host ||
            request.headers["sec-fetch-site"] === "cross-site"
          )
            throw new ApiError(403, "Cross-site request rejected");
        } else if (request.method !== "GET") throw new ApiError(405, "Method not allowed");

        if (route === "/api/health" && request.method === "GET") {
          await sql`SELECT 1`;
          return sendJson(response, 200, { status: "ok", database: "ready" });
        }
        if (route === "/api/auth/session" && request.method === "GET")
          return sendJson(response, 200, await session(request));
        if (route === "/api/auth/login" && request.method === "POST") {
          const input = credentials.parse(await body(request));
          const address = request.socket.remoteAddress ?? "local";
          const now = Date.now();
          // Bound memory and expire attempts without relying on a timer.
          for (const [key, attempt] of failedLogins)
            if (attempt.expires <= now) failedLogins.delete(key);
          if (failedLogins.size > 10000) failedLogins.delete(failedLogins.keys().next().value);
          const attempt = failedLogins.get(address) ?? { count: 0, expires: now + 15 * 60 * 1000 };
          if (attempt.count >= 20)
            throw new ApiError(429, "Too many sign-in attempts. Try again in 15 minutes.");
          const [user] =
            await sql`SELECT id, password_hash FROM private.users WHERE email = ${input.email}`;
          if (!(await verifyPassword(input.password, user?.password_hash))) {
            attempt.count++;
            failedLogins.set(address, attempt);
            throw new ApiError(401, "Invalid email or password");
          }
          failedLogins.delete(address);
          const token = newToken();
          const old = readToken(request);
          await sql.begin(async (tx) => {
            await tx`DELETE FROM private.sessions WHERE expires_at <= now() OR token_hash = ${hashToken(old ?? "")}`;
            await tx`INSERT INTO private.sessions(token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${user.id}, now() + ${SESSION_SECONDS} * interval '1 second')`;
          });
          response.setHeader("Set-Cookie", sessionCookie(token, secureCookies));
          return sendJson(response, 200, { ok: true });
        }
        if (route === "/api/auth/logout" && request.method === "POST") {
          await body(request);
          const token = readToken(request);
          if (token) await sql`DELETE FROM private.sessions WHERE token_hash = ${hashToken(token)}`;
          response.setHeader("Set-Cookie", sessionCookie("", secureCookies));
          return sendJson(response, 200, { ok: true });
        }
        const current = await session(request);
        if (!current) throw new ApiError(401, "Please sign in");
        if (request.method !== "POST") throw new ApiError(404, "API endpoint not found");
        const input = await body(request);
        if (route === "/api/query")
          return sendJson(response, 200, await executeQuery(sql, current, input));
        if (route === "/api/rpc")
          return sendJson(response, 200, await executeRpc(sql, current, input));
        if (route === "/api/accounts" || route === "/api/customer-accounts") {
          if (current.role !== "admin") throw new ApiError(403, "Only admins can create accounts");
          const isCustomer = route === "/api/customer-accounts";
          const data = isCustomer ? customerAccountSchema.parse(input) : accountSchema.parse(input);
          const passwordHash = await hashPassword(data.password);
          const id = await sql.begin(async (tx) => {
            let customer;
            if (isCustomer) {
              [customer] =
                await tx`SELECT * FROM public.customers WHERE id = ${data.customerId} FOR UPDATE`;
              if (!customer) throw new ApiError(404, "Customer not found");
              if (customer.user_id)
                throw new ApiError(409, "This customer already has portal access");
            }
            const [created] =
              await tx`INSERT INTO private.users(email, full_name, password_hash) VALUES (${(customer?.email ?? data.email).trim().toLowerCase()}, ${customer?.name ?? data.fullName}, ${passwordHash}) RETURNING id`;
            await tx`INSERT INTO public.user_roles(user_id, role) VALUES (${created.id}, ${isCustomer ? "customer" : data.role})`;
            if (customer)
              await tx`UPDATE public.customers SET user_id = ${created.id} WHERE id = ${customer.id}`;
            return created.id;
          });
          return sendJson(response, 201, { id });
        }
        throw new ApiError(404, "API endpoint not found");
      }
      if (request.method !== "GET" && request.method !== "HEAD")
        throw new ApiError(405, "Method not allowed");
      const pathname = decodeURIComponent(route);
      let file = path.resolve(dist, `.${pathname}`);
      if (file !== dist && !file.startsWith(`${dist}${path.sep}`))
        throw new ApiError(403, "Invalid path");
      let info = await stat(file).catch(() => null);
      if (!info?.isFile()) {
        if (path.extname(pathname)) throw new ApiError(404, "File not found");
        file = path.join(dist, "index.html");
        info = await stat(file).catch(() => null);
      }
      if (!info?.isFile())
        throw new ApiError(503, "Build the frontend with npm run build before starting the server");
      const extension = path.extname(file);
      response.writeHead(200, {
        "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
        "Cache-Control":
          extension === ".html"
            ? "no-cache"
            : file.startsWith(path.join(dist, "assets") + path.sep)
              ? "public, max-age=31536000, immutable"
              : "no-cache",
      });
      response.end(request.method === "HEAD" ? undefined : await readFile(file));
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof ApiError)
        return sendJson(response, error.status, { error: { message: error.message } });
      if (error instanceof z.ZodError)
        return sendJson(response, 400, {
          error: { message: error.issues[0]?.message ?? "Invalid request" },
        });
      if (error.code === "23505")
        return sendJson(response, 409, {
          error: { message: "A record with this email or value already exists." },
        });
      if (error.code === "42501")
        return sendJson(response, 403, {
          error: { message: "You don't have permission for this action." },
        });
      if (
        ["23503", "23514", "23502", "22P02", "22007", "22008", "22003", "P0001"].includes(
          error.code,
        )
      )
        return sendJson(response, 400, {
          error: {
            message:
              error.code === "P0001"
                ? error.message
                : error.code === "23503"
                  ? "This record is in use or references a missing record."
                  : "Invalid record values. Check the required fields, dates and amounts.",
          },
        });
      if (error instanceof URIError || error instanceof TypeError)
        return sendJson(response, 400, { error: { message: "Invalid request" } });
      console.error(error);
      sendJson(response, 500, {
        error: {
          message: "The local server could not complete this request. Check the application logs.",
        },
      });
    }
  });
}
