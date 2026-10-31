import { describe, expect, it } from "vitest";
import {
  calcTotals,
  effectiveInvoiceStatus,
  outstanding,
  round2,
  usableDiscount,
} from "@/lib/format";
import { revenueTrend } from "@/lib/metrics";

describe("billing arithmetic", () => {
  it("rounds decimal currency and caps discounts before tax", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(10.075)).toBe(10.08);
    expect(calcTotals([{ quantity: 1, unit_price: 20.15 }], 50).tax).toBe(10.08);
    expect(
      calcTotals([{ quantity: 3, unit_price: 19.99 }], 18, { type: "percentage", value: 10 }),
    ).toEqual({ subtotal: 59.97, discount: 6, tax: 9.71, total: 63.68 });
    expect(
      calcTotals([{ quantity: 1, unit_price: 10 }], 18, { type: "percentage", value: 150 }).total,
    ).toBe(0);
    expect(
      calcTotals([{ quantity: 1, unit_price: 10 }], 18, { type: "fixed", value: 100 }).total,
    ).toBe(0);
  });
  it("ignores inactive, expired and exhausted discounts", () => {
    const discount = { type: "percentage" as const, value: 10 };
    for (const metadata of [
      { active: false },
      { expires_on: "2000-01-01" },
      { usage_limit: 2, used_count: 2 },
    ]) {
      expect(
        calcTotals([{ quantity: 1, unit_price: 100 }], 0, { ...discount, ...metadata }).total,
      ).toBe(100);
    }
    expect(usableDiscount({ ...discount, expires_on: "2026-10-31" }, "2026-10-31")).toBe(true);
  });
  it("calculates partial balances and overdue dates without reclassifying drafts", () => {
    expect(outstanding("19.99", [{ amount: "9.99" }])).toBe(10);
    expect(effectiveInvoiceStatus("confirmed", "2026-10-30", "2026-10-31")).toBe("overdue");
    expect(effectiveInvoiceStatus("confirmed", "2026-10-31", "2026-10-31")).toBe("confirmed");
    expect(effectiveInvoiceStatus("draft", "2026-10-01", "2026-10-31")).toBe("draft");
  });
});

it("groups collections by payment date and preserves cents, excluding cancelled/draft invoices", () => {
  const result = revenueTrend([
    {
      issue_date: "2026-09-01",
      total: 10.25,
      status: "paid",
      payments: [{ amount: 10.25, paid_on: "2026-10-05" }],
    },
    { issue_date: "2026-09-02", total: 1.25, status: "confirmed", payments: [] },
    { issue_date: "2026-10-01", total: 500, status: "cancelled", payments: [] },
    { issue_date: "2026-10-01", total: 500, status: "draft", payments: [] },
  ]);
  expect(result).toEqual([
    { monthKey: "2026-09", month: "Sep 26", invoiced: 11.5, collected: 0 },
    { monthKey: "2026-10", month: "Oct 26", invoiced: 0, collected: 10.25 },
  ]);
});
