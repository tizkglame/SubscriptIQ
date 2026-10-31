import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, CheckCircle2, Printer, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, Loading, StatusBadge, tableHead } from "@/components/common";
import { PaymentDialog } from "@/components/payment-dialog";
import { useAction, db } from "@/lib/data";
import { guard } from "@/lib/auth";
import { effectiveInvoiceStatus, fmtDate, money, outstanding } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Invoice — SubscriptIQ" }] }),
  component: InvoiceDetailPage,
});

type InvoiceDetail = {
  id: string;
  number: string;
  subscription_id: string;
  customer_id: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  status: string;
  created_at: string;
  customers: {
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
    payment_terms_days: number;
    tax_rate: number;
  } | null;
  invoice_lines: {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    paid_on: string;
    notes: string | null;
    is_demo: boolean;
    created_at: string;
  }[];
};

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useRouteContext({ from: "/_authenticated" });
  const [payOpen, setPayOpen] = useState(false);

  const { data: inv, isLoading, error } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("invoices")
        .select("*, customers(*), subscriptions(id, number, status, payment_terms_days, tax_rate), invoice_lines(*), payments(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as InvoiceDetail;
    },
  });

  const cancelInvoice = useAction(
    async () => {
      const { error } = await db.from("invoices").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    "Invoice cancelled"
  );

  const deleteInvoice = useAction(
    async () => {
      const { error } = await db.from("invoices").delete().eq("id", id);
      if (error) throw error;
      navigate({ to: "/invoices" });
    },
    "Invoice deleted"
  );

  if (isLoading) return <Loading />;
  if (error || !inv) {
    return (
      <div className="py-8">
        <Link to="/invoices" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Invoices
        </Link>
        <p className="mt-4 text-destructive">Invoice not found.</p>
      </div>
    );
  }

  const effStatus = effectiveInvoiceStatus(inv.status, inv.due_date);
  const totalPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = outstanding(inv.total, inv.payments);
  const isPayable = balance > 0 && inv.status !== "cancelled" && inv.status !== "draft";

  return (
    <>
      <Link
        to="/invoices"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Invoices
      </Link>

      <PageHeader
        title={inv.number}
        subtitle={`Issued on ${fmtDate(inv.issue_date)} · Due on ${fmtDate(inv.due_date)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isPayable && (
              <Button onClick={() => setPayOpen(true)}>
                <Wallet className="h-4 w-4" /> Record payment
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            {inv.status === "confirmed" && inv.payments.length === 0 && (
              <Button
                variant="outline"
                disabled={cancelInvoice.isPending}
                onClick={() => confirm("Are you sure you want to cancel this invoice?") && cancelInvoice.mutate(undefined)}
              >
                <Ban className="h-4 w-4 text-warning" /> Cancel
              </Button>
            )}
            {role === "admin" && (
              <Button
                variant="outline"
                disabled={deleteInvoice.isPending}
                onClick={() => confirm(`Are you sure you want to delete ${inv.number}?`) && deleteInvoice.mutate(undefined)}
              >
                <Trash2 className="h-4 w-4 text-destructive" /> Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          {/* Invoice Overview */}
          <Panel className="p-5">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Status</span>
                <div className="mt-1">
                  <StatusBadge status={effStatus} />
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Amount Due</span>
                <div className={`mt-1 text-lg font-semibold ${balance > 0 ? "text-destructive" : "text-success"}`}>
                  {money(balance)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Customer</span>
                <div className="mt-0.5 font-medium text-foreground">{inv.customers?.name ?? "—"}</div>
                {inv.customers?.company && (
                  <div className="text-xs text-muted-foreground">{inv.customers.company}</div>
                )}
                {inv.customers?.email && (
                  <div className="text-xs text-muted-foreground">{inv.customers.email}</div>
                )}
              </div>

              <div>
                <span className="text-xs font-medium text-muted-foreground">Linked Subscription</span>
                <div className="mt-0.5">
                  {inv.subscriptions ? (
                    <Link
                      to="/subscriptions/$id"
                      params={{ id: inv.subscriptions.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {inv.subscriptions.number}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                {inv.subscriptions && (
                  <div className="text-xs capitalize text-muted-foreground">
                    Status: {inv.subscriptions.status}
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs font-medium text-muted-foreground">Billing Period</span>
                <div className="mt-0.5 text-sm">
                  {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-muted-foreground">Payment Dates</span>
                <div className="mt-0.5 text-sm">
                  Issued: {fmtDate(inv.issue_date)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Due: {fmtDate(inv.due_date)}
                </div>
              </div>
            </div>
          </Panel>

          {/* Line items */}
          <Panel>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="font-semibold">Line items</h3>
              <span className="text-xs text-muted-foreground">
                {inv.invoice_lines.length} item{inv.invoice_lines.length === 1 ? "" : "s"}
              </span>
            </div>
            {inv.invoice_lines.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No line items recorded for this invoice.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHead}>
                    <tr>
                      <th className="px-4 py-2.5 text-left">Description</th>
                      <th className="px-4 py-2.5 text-right">Quantity</th>
                      <th className="px-4 py-2.5 text-right">Unit Price</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.invoice_lines.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="px-4 py-3 font-medium text-foreground">{l.description}</td>
                        <td className="px-4 py-3 text-right">{l.quantity}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{money(l.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-medium">{money(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Payment history */}
          <Panel>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="font-semibold">Payment history</h3>
              <span className="text-xs text-muted-foreground">
                {inv.payments.length} payment{inv.payments.length === 1 ? "" : "s"}
              </span>
            </div>
            {inv.payments.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No payments recorded yet.
                {isPayable && (
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
                      <Wallet className="h-3.5 w-3.5" /> Record first payment
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHead}>
                    <tr>
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Method</th>
                      <th className="px-4 py-2.5 text-left">Notes</th>
                      <th className="px-4 py-2.5 text-left">Type</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.payments.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.paid_on)}</td>
                        <td className="px-4 py-3 capitalize">{p.method.replace("_", " ")}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{p.notes || "—"}</td>
                        <td className="px-4 py-3 text-xs">
                          {p.is_demo ? (
                            <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">
                              Demo
                            </span>
                          ) : (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              Live
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-success">+{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* Sidebar Summary */}
        <div className="grid content-start gap-6">
          <Panel className="p-5">
            <h3 className="mb-3 font-semibold">Payment summary</h3>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{money(inv.subtotal)}</dd>
              </div>
              {Number(inv.discount_amount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="text-success">−{money(inv.discount_amount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd>{money(inv.tax_amount)}</dd>
              </div>
              <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd>{money(inv.total)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Total paid</dt>
                <dd className="font-medium text-foreground">{money(totalPaid)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Balance due</dt>
                <dd className={balance > 0 ? "text-destructive" : "text-success"}>{money(balance)}</dd>
              </div>
            </dl>

            {isPayable ? (
              <Button className="mt-5 w-full gap-2" onClick={() => setPayOpen(true)}>
                <Wallet className="h-4 w-4" /> Record payment
              </Button>
            ) : balance <= 0 ? (
              <div className="mt-5 flex items-center justify-center gap-1.5 rounded-lg bg-success/10 py-2.5 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> Invoice settled
              </div>
            ) : null}
          </Panel>

          {/* Customer details card */}
          {inv.customers && (
            <Panel className="p-5">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-semibold">Customer details</h3>
                <Link to="/customers" className="text-xs text-primary hover:underline">
                  View customers
                </Link>
              </div>
              <div className="mt-3 grid gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Name:</span>
                  <div className="font-medium">{inv.customers.name}</div>
                </div>
                {inv.customers.company && (
                  <div>
                    <span className="text-xs text-muted-foreground">Company:</span>
                    <div>{inv.customers.company}</div>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground">Email:</span>
                  <div>{inv.customers.email}</div>
                </div>
                {inv.customers.phone && (
                  <div>
                    <span className="text-xs text-muted-foreground">Phone:</span>
                    <div>{inv.customers.phone}</div>
                  </div>
                )}
                {inv.customers.address && (
                  <div>
                    <span className="text-xs text-muted-foreground">Billing address:</span>
                    <div className="text-xs text-muted-foreground whitespace-pre-line">
                      {inv.customers.address}
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <PaymentDialog
        invoice={payOpen ? { id: inv.id, number: inv.number } : null}
        balance={balance}
        onClose={() => setPayOpen(false)}
      />
    </>
  );
}
