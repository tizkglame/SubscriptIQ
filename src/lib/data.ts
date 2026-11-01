import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { localDb } from "@/lib/api";
import { errMsg } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table =
  | "customers"
  | "products"
  | "product_variants"
  | "plans"
  | "discounts"
  | "subscriptions"
  | "subscription_lines"
  | "invoices"
  | "invoice_lines"
  | "payments"
  | "profiles"
  | "user_roles";

export function useList<T = any>(
  table: Table,
  select = "*",
  order = "created_at",
  ascending = false,
) {
  return useQuery({
    queryKey: [table, select, order, ascending],
    throwOnError: true,
    queryFn: ({ signal }) => readAll<T>(table, select, order, ascending, signal),
  });
}

/** Follow every API page so client-side totals and filters are complete. */
export async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await queryPage(rows.length, rows.length + 999);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
  }
}

export function readAll<T = any>(
  table: Table,
  select = "*",
  order = "created_at",
  ascending = false,
  signal?: AbortSignal,
) {
  return fetchAllRows<T>((from, to) => {
    let query = db.from(table).select(select).order(order, { ascending });
    if (order !== "id") query = query.order("id", { ascending: true });
    query = query.range(from, to);
    return signal ? query.abortSignal(signal) : query;
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/** Generic save/delete mutation with toasts and cache refresh. */
export function useAction<V>(
  fn: (v: V) => PromiseLike<unknown>,
  success: string,
  onDone?: () => void,
) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (v: V) => {
      const r: any = await fn(v);
      if (r && r.error) throw r.error;
      return r;
    },
    onSuccess: async () => {
      await inv();
      toast.success(success);
      onDone?.();
    },
    onError: (e) => toast.error(friendly(errMsg(e))),
  });
}

function friendly(m: string) {
  if (m.includes("violates foreign key"))
    return "This record is in use by other records and cannot be deleted.";
  if (m.includes("row-level security")) return "You don't have permission for this action.";
  if (m.includes("duplicate key")) return "A record with this value already exists.";
  return m;
}

export const db = localDb;
