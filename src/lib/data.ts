import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = "customers" | "products" | "product_variants" | "plans" | "discounts" | "subscriptions" | "subscription_lines" | "invoices" | "invoice_lines" | "payments";

export function useList<T = any>(table: Table, select = "*", order = "created_at", ascending = false) {
  return useQuery({
    queryKey: [table, select],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select(select).order(order, { ascending });
      if (error) throw error;
      return data as unknown as T[];
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/** Generic save/delete mutation with toasts and cache refresh. */
export function useAction<V>(fn: (v: V) => Promise<unknown>, success: string, onDone?: () => void) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (v: V) => {
      const r: any = await fn(v);
      if (r && r.error) throw r.error;
      return r;
    },
    onSuccess: () => { toast.success(success); inv(); onDone?.(); },
    onError: (e) => toast.error(friendly(errMsg(e))),
  });
}

function friendly(m: string) {
  if (m.includes("violates foreign key")) return "This record is in use by other records and cannot be deleted.";
  if (m.includes("row-level security")) return "You don't have permission for this action.";
  if (m.includes("duplicate key")) return "A record with this value already exists.";
  return m;
}

export const db = supabase as any;
