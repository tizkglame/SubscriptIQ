/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Role } from "./auth";

export type Session = { user: { id: string; email: string; full_name: string }; role: Role };
const events = new EventTarget();

export function onAuthChange(callback: () => void) {
  events.addEventListener("change", callback);
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("auth");
  if (channel) channel.onmessage = callback;
  return () => {
    events.removeEventListener("change", callback);
    channel?.close();
  };
}

function authChanged() {
  events.dispatchEvent(new Event("change"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("auth");
    channel.postMessage("change");
    channel.close();
  }
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") authChanged();
    throw new Error(result.error?.message ?? "The local server could not complete this request");
  }
  return result;
}

export async function signIn(email: string, password: string) {
  await api("/auth/login", { email, password });
  authChanged();
}

export async function signOut() {
  await api("/auth/logout", {});
  authChanged();
}

export const getSession = () => api<Session | null>("/auth/session");
export const createStaff = ({
  data,
}: {
  data: { email: string; fullName: string; password: string; role: "staff" | "admin" };
}) => api("/accounts", data);
export const createCustomerAccount = (data: { customerId: string; password: string }) =>
  api("/customer-accounts", data);

type Result = { data: any; error: Error | null };

// Every table, field, relationship and mutation is validated again on the server.
class Query implements PromiseLike<Result> {
  private spec: Record<string, any>;
  private signal?: AbortSignal;
  constructor(table: string) {
    this.spec = { table, operation: "select", select: "*", filters: [], orders: [] };
  }
  select(fields = "*") {
    this.spec["select"] = fields;
    return this;
  }
  insert(data: unknown) {
    this.spec["operation"] = "insert";
    this.spec["data"] = data;
    return this;
  }
  update(data: unknown) {
    this.spec["operation"] = "update";
    this.spec["data"] = data;
    return this;
  }
  delete() {
    this.spec["operation"] = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.spec["filters"].push({ column, value });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.spec["orders"].push({ column, ascending: options?.ascending ?? true });
    return this;
  }
  range(from: number, to: number) {
    this.spec["offset"] = from;
    this.spec["limit"] = to - from + 1;
    return this;
  }
  limit(count: number) {
    this.spec["limit"] = count;
    return this;
  }
  single() {
    this.spec["cardinality"] = "one";
    return this;
  }
  maybeSingle() {
    this.spec["cardinality"] = "maybe";
    return this;
  }
  abortSignal(signal: AbortSignal) {
    this.signal = signal;
    return this;
  }
  async execute(): Promise<Result> {
    try {
      return { data: await api("/query", this.spec, this.signal), error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const localDb = {
  from: (table: string) => new Query(table),
  async rpc(name: string, args = {}): Promise<Result> {
    try {
      return { data: await api("/rpc", { name, args }), error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  },
};
