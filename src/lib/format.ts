import Decimal from "decimal.js-light";

export const money = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));

export const fmtDate = (d: string | null | undefined) =>
  d
    ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

/** Billing uses the database UTC calendar date, independently of the browser timezone. */
export const todayISO = () => new Date().toISOString().slice(0, 10);

export type BillingPeriod = "daily" | "weekly" | "monthly" | "yearly";

/** Multiplier converting one billing period's amount into a monthly amount. */
export const monthlyFactor: Record<BillingPeriod, number> = {
  daily: 30,
  weekly: 52 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

export type Discount = {
  type: "fixed" | "percentage";
  value: number;
  active?: boolean;
  expires_on?: string | null;
  usage_limit?: number | null;
  used_count?: number;
};

export function usableDiscount(discount: Discount, date = todayISO()) {
  return (
    discount.active !== false &&
    (!discount.expires_on || discount.expires_on >= date) &&
    (discount.usage_limit == null || (discount.used_count ?? 0) < discount.usage_limit)
  );
}

export function calcTotals(
  lines: { quantity: number; unit_price: number }[],
  taxRate: number,
  discount?: Discount | null,
) {
  const subtotal = lines.reduce(
    (sum, line) => sum.plus(new Decimal(line.quantity).times(line.unit_price)),
    new Decimal(0),
  );
  let disc = new Decimal(0);
  if (discount && usableDiscount(discount)) {
    disc =
      discount.type === "fixed"
        ? new Decimal(discount.value)
        : subtotal.times(discount.value).dividedBy(100);
    if (disc.greaterThan(subtotal)) disc = subtotal;
    if (disc.lessThan(0)) disc = new Decimal(0);
    disc = disc.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
  const tax = subtotal
    .minus(disc)
    .times(taxRate)
    .dividedBy(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    subtotal: subtotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    discount: disc.toNumber(),
    tax: tax.toNumber(),
    total: subtotal.minus(disc).plus(tax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
  };
}

export const round2 = (n: number) =>
  new Decimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

/** Invoice status as shown to users: unpaid confirmed invoices past due are overdue. */
export function effectiveInvoiceStatus(status: string, dueDate: string, today = todayISO()) {
  if (status === "confirmed" && dueDate < today) return "overdue";
  return status;
}

export function outstanding(total: number | string, payments: { amount: number | string }[] = []) {
  return payments
    .reduce((balance, payment) => balance.minus(payment.amount), new Decimal(total))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

export const errMsg = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String((e as { message: unknown }).message)
      : "Something went wrong";
