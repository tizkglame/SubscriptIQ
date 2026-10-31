import { round2 } from "./format";

type RevenueInvoice = {
  issue_date: string;
  status: string;
  total: number | string;
  payments: { amount: number | string; paid_on: string }[];
};

/** Collections belong to their payment month, including payments on older invoices. */
export function revenueTrend(invoices: RevenueInvoice[]) {
  const months = new Map<
    string,
    { monthKey: string; month: string; invoiced: number; collected: number }
  >();
  const entry = (date: string) => {
    const key = date.slice(0, 7);
    let value = months.get(key);
    if (!value) {
      value = {
        monthKey: key,
        month: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }),
        invoiced: 0,
        collected: 0,
      };
      months.set(key, value);
    }
    return value;
  };
  for (const invoice of invoices) {
    if (invoice.status === "cancelled" || invoice.status === "draft") continue;
    entry(invoice.issue_date).invoiced += Number(invoice.total);
    for (const payment of invoice.payments ?? [])
      entry(payment.paid_on).collected += Number(payment.amount);
  }
  return [...months.values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .slice(-6)
    .map((month) => ({
      ...month,
      invoiced: round2(month.invoiced),
      collected: round2(month.collected),
    }));
}
