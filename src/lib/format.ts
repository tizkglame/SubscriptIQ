export const money = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export const todayISO = () => new Date().toISOString().slice(0, 10);

export type BillingPeriod = "daily" | "weekly" | "monthly" | "yearly";

/** Multiplier converting one billing period's amount into a monthly amount. */
export const monthlyFactor: Record<BillingPeriod, number> = {
  daily: 30,
  weekly: 52 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

export function calcTotals(
  lines: { quantity: number; unit_price: number }[],
  taxRate: number,
  discount?: { type: "fixed" | "percentage"; value: number } | null,
) {
  const subtotal = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);
  let disc = 0;
  if (discount) disc = discount.type === "fixed" ? Math.min(Number(discount.value), subtotal) : round2((subtotal * Number(discount.value)) / 100);
  const tax = round2(((subtotal - disc) * Number(taxRate)) / 100);
  return { subtotal: round2(subtotal), discount: disc, tax, total: round2(subtotal - disc + tax) };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Invoice status as shown to users: unpaid confirmed invoices past due are overdue. */
export function effectiveInvoiceStatus(status: string, dueDate: string, today = todayISO()) {
  if (status === "confirmed" && dueDate < today) return "overdue";
  return status;
}

export function outstanding(total: number | string, payments: { amount: number | string }[] = []) {
  return round2(Number(total) - payments.reduce((s, p) => s + Number(p.amount), 0));
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong");
