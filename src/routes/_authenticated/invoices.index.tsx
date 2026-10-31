import { useCallback, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Panel, SearchBox, usePaged, Pager, EmptyState, Loading, StatusBadge, tableHead } from "@/components/common";
import { PaymentDialog } from "@/components/payment-dialog";
import { RunBillingButton } from "@/routes/_authenticated/subscriptions.index";
import { useList } from "@/lib/data";
import { guard } from "@/lib/auth";
import { effectiveInvoiceStatus, fmtDate, money, outstanding } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/invoices/")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Invoices — SubscriptIQ" }] }),
  component: InvoicesPage,
});

export type InvoiceRow = {
  id: string;
  number: string;
  issue_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  status: string;
  created_at: string;
  customers: { id: string; name: string } | null;
  subscriptions: { id: string; number: string } | null;
  payments: { amount: number }[];
};

export const INVOICE_SELECT = "*, customers(id, name), subscriptions(id, number), payments(amount)";

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "draft", label: "Draft" },
  { value: "cancelled", label: "Cancelled" },
];

function InvoicesPage() {
  const { data, isLoading } = useList<InvoiceRow>("invoices", INVOICE_SELECT, "issue_date", false);
  const [status, setStatus] = useState("all");
  const [activePaymentInvoice, setActivePaymentInvoice] = useState<{ id: string; number: string; balance: number } | null>(null);

  const filter = useCallback(
    (inv: InvoiceRow, q: string) => {
      const eff = effectiveInvoiceStatus(inv.status, inv.due_date);
      const matchesStatus = status === "all" || eff === status || inv.status === status;
      const matchesQuery =
        !q ||
        inv.number.toLowerCase().includes(q) ||
        Boolean(inv.customers?.name?.toLowerCase().includes(q)) ||
        Boolean(inv.subscriptions?.number?.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    },
    [status]
  );

  const t = usePaged(data, filter);

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Billing statements and payment tracking"
        actions={<RunBillingButton />}
      />

      <Panel>
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <SearchBox value={t.q} onChange={t.setQ} placeholder="Search number, customer, subscription" />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              t.setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Loading />
        ) : t.total === 0 ? (
          <EmptyState
            title="No invoices found"
            hint={
              t.q || status !== "all"
                ? "Try adjusting your search or status filter."
                : "Invoices will be generated when billing runs for active subscriptions."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-2.5 text-left">Invoice</th>
                  <th className="px-4 py-2.5 text-left">Customer</th>
                  <th className="px-4 py-2.5 text-left">Subscription</th>
                  <th className="px-4 py-2.5 text-left">Issue Date</th>
                  <th className="px-4 py-2.5 text-left">Due Date</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {t.rows.map((inv) => {
                  const effStatus = effectiveInvoiceStatus(inv.status, inv.due_date);
                  const bal = outstanding(inv.total, inv.payments);
                  const isUnpaid = bal > 0 && inv.status !== "cancelled" && inv.status !== "draft";

                  return (
                    <tr key={inv.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link
                          to="/invoices/$id"
                          params={{ id: inv.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {inv.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {inv.customers?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {inv.subscriptions ? (
                          <Link
                            to="/subscriptions/$id"
                            params={{ id: inv.subscriptions.id }}
                            className="hover:text-primary hover:underline"
                          >
                            {inv.subscriptions.number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.issue_date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium text-foreground">{money(inv.total)}</div>
                        {bal > 0 && bal < inv.total && (
                          <div className="text-[11px] text-muted-foreground">Bal: {money(bal)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={effStatus} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {isUnpaid && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() =>
                                setActivePaymentInvoice({
                                  id: inv.id,
                                  number: inv.number,
                                  balance: bal,
                                })
                              }
                            >
                              <Wallet className="h-3.5 w-3.5" />
                              Pay
                            </Button>
                          )}
                          <Link
                            to="/invoices/$id"
                            params={{ id: inv.id }}
                            className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...t} />
      </Panel>

      <PaymentDialog
        invoice={
          activePaymentInvoice
            ? { id: activePaymentInvoice.id, number: activePaymentInvoice.number }
            : null
        }
        balance={activePaymentInvoice?.balance ?? 0}
        onClose={() => setActivePaymentInvoice(null)}
      />
    </>
  );
}
