import { useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Package,
  Repeat,
  ShieldCheck,
  User,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, Loading, StatusBadge, tableHead, EmptyState } from "@/components/common";
import { PaymentDialog } from "@/components/payment-dialog";
import { db } from "@/lib/data";
import { guard } from "@/lib/auth";
import { calcTotals, effectiveInvoiceStatus, fmtDate, money, outstanding } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/portal")({
  beforeLoad: guard(["customer", "admin", "staff"]),
  head: () => ({ meta: [{ title: "My Account — SubscriptIQ" }] }),
  component: CustomerPortalPage,
});

type PortalData = {
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    address: string | null;
  } | null;
  subscriptions: {
    id: string;
    number: string;
    status: string;
    start_date: string;
    expiry_date: string | null;
    tax_rate: number;
    plans: { name: string; billing_period: string; pausable: boolean; closable: boolean } | null;
    discounts: { type: "fixed" | "percentage"; value: number; code: string } | null;
    subscription_lines: {
      id: string;
      quantity: number;
      unit_price: number;
      products: { name: string; type: string } | null;
    }[];
  }[];
  invoices: {
    id: string;
    number: string;
    period_start: string;
    period_end: string;
    issue_date: string;
    due_date: string;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total: number;
    status: string;
    payments: { id: string; amount: number; paid_on: string; method: string }[];
  }[];
};

function CustomerPortalPage() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const [payInvoice, setPayInvoice] = useState<{ id: string; number: string; balance: number } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["customer-portal", user.id],
    queryFn: async () => {
      // 1. Locate customer account for logged in user
      let { data: customer } = await db
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!customer && user.email) {
        const { data: byEmail } = await db
          .from("customers")
          .select("*")
          .eq("email", user.email)
          .maybeSingle();
        if (byEmail) {
          customer = byEmail;
        }
      }

      if (!customer) {
        // Query subscriptions and invoices directly using RLS policies
        const { data: subs } = await db
          .from("subscriptions")
          .select("*, plans(name, billing_period, pausable, closable), discounts(type, value, code), subscription_lines(*, products(name, type))")
          .order("created_at", { ascending: false });

        const { data: invs } = await db
          .from("invoices")
          .select("*, payments(id, amount, paid_on, method)")
          .order("issue_date", { ascending: false });

        return {
          customer: null,
          subscriptions: (subs ?? []) as PortalData["subscriptions"],
          invoices: (invs ?? []) as PortalData["invoices"],
        };
      }

      // 2. Fetch customer's subscriptions
      const { data: subs, error: subsErr } = await db
        .from("subscriptions")
        .select("*, plans(name, billing_period, pausable, closable), discounts(type, value, code), subscription_lines(*, products(name, type))")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });

      if (subsErr) throw subsErr;

      // 3. Fetch customer's invoices
      const { data: invs, error: invsErr } = await db
        .from("invoices")
        .select("*, payments(id, amount, paid_on, method)")
        .eq("customer_id", customer.id)
        .order("issue_date", { ascending: false });

      if (invsErr) throw invsErr;

      return {
        customer,
        subscriptions: (subs ?? []) as PortalData["subscriptions"],
        invoices: (invs ?? []) as PortalData["invoices"],
      };
    },
  });

  if (isLoading) return <Loading label="Loading your account details…" />;
  if (error || !data) {
    return <p className="py-8 text-destructive">Failed to load customer portal.</p>;
  }

  const activeSub =
    data.subscriptions.find((s) => s.status === "active") ?? data.subscriptions[0];

  const totalOutstanding = data.invoices
    .filter((inv) => inv.status !== "cancelled")
    .reduce((sum, inv) => sum + outstanding(inv.total, inv.payments ?? []), 0);

  const subTotals = activeSub
    ? calcTotals(activeSub.subscription_lines, activeSub.tax_rate, activeSub.discounts)
    : null;

  return (
    <>
      <PageHeader
        title="Customer Portal"
        subtitle="Manage your recurring plan, view invoices and settle outstanding balances"
      />

      {/* Customer Info & Key Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Active Plan</span>
            <Repeat className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {activeSub?.plans?.name ?? "No Active Plan"}
          </div>
          <div className="mt-1 text-xs capitalize text-muted-foreground">
            {activeSub?.plans?.billing_period
              ? `Billed ${activeSub.plans.billing_period}`
              : "Contact support for subscription setup"}
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Status</span>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <div className="mt-2">
            {activeSub ? (
              <StatusBadge status={activeSub.status} />
            ) : (
              <span className="text-sm font-medium text-muted-foreground">—</span>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {activeSub ? `Agreement ${activeSub.number}` : "Inactive"}
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Renewal / Expiry</span>
            <Clock className="h-4 w-4 text-info" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {activeSub?.expiry_date ? fmtDate(activeSub.expiry_date) : "Auto-renews"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Started: {activeSub ? fmtDate(activeSub.start_date) : "—"}
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Outstanding Balance</span>
            <Wallet
              className={`h-4 w-4 ${
                totalOutstanding > 0 ? "text-destructive" : "text-success"
              }`}
            />
          </div>
          <div
            className={`mt-2 text-xl font-bold ${
              totalOutstanding > 0 ? "text-destructive" : "text-success"
            }`}
          >
            {money(totalOutstanding)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {totalOutstanding > 0 ? "Payment due" : "All payments up to date"}
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left: Active Subscription Details */}
        <div className="grid content-start gap-6 lg:col-span-2">
          {activeSub ? (
            <Panel className="p-5">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="font-semibold text-foreground">Current Subscription</h3>
                  <p className="text-xs text-muted-foreground">
                    Agreement {activeSub.number} · {activeSub.plans?.name}
                  </p>
                </div>
                <StatusBadge status={activeSub.status} />
              </div>

              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Included Services & Products
                </h4>
                <div className="mt-2 divide-y rounded-lg border">
                  {activeSub.subscription_lines.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between p-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-foreground">
                            {l.products?.name ?? "Service"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Qty: {l.quantity} × {money(l.unit_price)}
                          </div>
                        </div>
                      </div>
                      <div className="font-medium text-foreground">
                        {money(l.quantity * l.unit_price)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {subTotals && (
                <div className="mt-4 flex flex-col gap-1.5 border-t pt-3 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{money(subTotals.subtotal)}</span>
                  </div>
                  {subTotals.discount > 0 && (
                    <div className="flex justify-between text-success">
                      <span>Discount ({activeSub.discounts?.code})</span>
                      <span>−{money(subTotals.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax ({activeSub.tax_rate}%)</span>
                    <span>{money(subTotals.tax)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-semibold text-foreground">
                    <span>Total per {activeSub.plans?.billing_period ?? "period"}</span>
                    <span>{money(subTotals.total)}</span>
                  </div>
                </div>
              )}
            </Panel>
          ) : (
            <Panel className="p-8 text-center">
              <EmptyState
                title="No active subscription found"
                hint="You currently do not have an active billing agreement associated with this account."
              />
            </Panel>
          )}

          {/* Customer Invoices Table */}
          <Panel>
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h3 className="font-semibold text-foreground">Invoices & Statements</h3>
                <p className="text-xs text-muted-foreground">
                  View billing history and pay unpaid statements
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {data.invoices.length} invoice{data.invoices.length === 1 ? "" : "s"}
              </span>
            </div>

            {data.invoices.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No invoices have been issued to your account yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHead}>
                    <tr>
                      <th className="px-4 py-2.5 text-left">Invoice</th>
                      <th className="px-4 py-2.5 text-left">Period</th>
                      <th className="px-4 py-2.5 text-left">Due Date</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((inv) => {
                      const eff = effectiveInvoiceStatus(inv.status, inv.due_date);
                      const bal = outstanding(inv.total, inv.payments);
                      const canPay =
                        bal > 0 && inv.status !== "cancelled" && inv.status !== "draft";

                      return (
                        <tr key={inv.id} className="border-t hover:bg-muted/40">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {inv.number}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {fmtDate(inv.due_date)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-medium text-foreground">
                              {money(inv.total)}
                            </div>
                            {bal > 0 && bal < inv.total && (
                              <div className="text-[11px] text-muted-foreground">
                                Bal: {money(bal)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={eff} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canPay ? (
                              <Button
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                onClick={() =>
                                  setPayInvoice({
                                    id: inv.id,
                                    number: inv.number,
                                    balance: bal,
                                  })
                                }
                              >
                                <Wallet className="h-3.5 w-3.5" /> Pay {money(bal)}
                              </Button>
                            ) : (
                              <span className="text-xs font-medium text-success">
                                Settled
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* Right: Customer Profile Card */}
        <div className="grid content-start gap-6">
          <Panel className="p-5">
            <h3 className="mb-3 font-semibold text-foreground">Account Information</h3>
            <div className="grid gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Account Name:</span>
                <div className="font-medium text-foreground">
                  {data.customer?.name ?? user.email}
                </div>
              </div>
              {data.customer?.company && (
                <div>
                  <span className="text-xs text-muted-foreground">Company:</span>
                  <div className="text-foreground">{data.customer.company}</div>
                </div>
              )}
              <div>
                <span className="text-xs text-muted-foreground">Email:</span>
                <div className="text-foreground">{data.customer?.email ?? user.email}</div>
              </div>
              {data.customer?.phone && (
                <div>
                  <span className="text-xs text-muted-foreground">Phone:</span>
                  <div className="text-foreground">{data.customer.phone}</div>
                </div>
              )}
              {data.customer?.address && (
                <div>
                  <span className="text-xs text-muted-foreground">Billing Address:</span>
                  <div className="text-xs text-muted-foreground whitespace-pre-line">
                    {data.customer.address}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel className="p-5">
            <h3 className="mb-2 font-semibold text-foreground">Security & Access</h3>
            <p className="text-xs text-muted-foreground">
              You are signed in via SubscriptIQ Secure Customer Portal. Row-Level Security
              enforces that only records associated with your account are accessible.
            </p>
          </Panel>
        </div>
      </div>

      <PaymentDialog
        invoice={
          payInvoice
            ? { id: payInvoice.id, number: payInvoice.number }
            : null
        }
        balance={payInvoice?.balance ?? 0}
        onClose={() => setPayInvoice(null)}
      />
    </>
  );
}
