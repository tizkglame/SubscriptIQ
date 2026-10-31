import { useCallback, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard, Wallet, ArrowUpRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Panel, SearchBox, usePaged, Pager, EmptyState, Loading, tableHead } from "@/components/common";
import { useList } from "@/lib/data";
import { guard } from "@/lib/auth";
import { fmtDate, money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Payments — SubscriptIQ" }] }),
  component: PaymentsPage,
});

export type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  paid_on: string;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
  invoices: {
    id: string;
    number: string;
    customer_id: string;
    customers: {
      id: string;
      name: string;
    } | null;
  } | null;
};

export const PAYMENT_SELECT = "*, invoices(id, number, customer_id, customers(id, name))";

const METHODS = [
  { value: "all", label: "All methods" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "paypal", label: "PayPal" },
  { value: "cash", label: "Cash" },
];

function PaymentsPage() {
  const { data, isLoading } = useList<PaymentRow>("payments", PAYMENT_SELECT, "paid_on", false);
  const [method, setMethod] = useState("all");

  const filter = useCallback(
    (p: PaymentRow, q: string) => {
      const matchesMethod = method === "all" || p.method === method;
      const matchesQuery =
        !q ||
        Boolean(p.invoices?.number?.toLowerCase().includes(q)) ||
        Boolean(p.invoices?.customers?.name?.toLowerCase().includes(q)) ||
        Boolean(p.method?.toLowerCase().includes(q)) ||
        Boolean(p.notes?.toLowerCase().includes(q));
      return matchesMethod && matchesQuery;
    },
    [method]
  );

  const t = usePaged(data, filter);

  const totalCollected = (data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Complete ledger of settled invoices and transaction history"
        actions={
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 shadow-sm">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Total collected:</span>
            <span className="font-semibold text-foreground">{money(totalCollected)}</span>
          </div>
        }
      />

      <Panel>
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <SearchBox
            value={t.q}
            onChange={t.setQ}
            placeholder="Search invoice, customer, method, notes"
          />
          <Select
            value={method}
            onValueChange={(v) => {
              setMethod(v);
              t.setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Loading />
        ) : t.total === 0 ? (
          <EmptyState
            title="No payments recorded"
            hint={
              t.q || method !== "all"
                ? "Try adjusting your search or method filter."
                : "Record payments against confirmed invoices from the Invoices page."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-2.5 text-left">Payment Date</th>
                  <th className="px-4 py-2.5 text-left">Customer</th>
                  <th className="px-4 py-2.5 text-left">Invoice</th>
                  <th className="px-4 py-2.5 text-left">Method</th>
                  <th className="px-4 py-2.5 text-left">Type</th>
                  <th className="px-4 py-2.5 text-left">Transaction Details</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {t.rows.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {fmtDate(p.paid_on)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {p.invoices?.customers?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.invoices ? (
                        <Link
                          to="/invoices/$id"
                          params={{ id: p.invoices.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {p.invoices.number}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 capitalize text-muted-foreground">
                        <CreditCard className="h-3.5 w-3.5" />
                        {p.method.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.is_demo ? (
                        <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">
                          Demo
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Live
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                      {p.notes || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-success">
                      +{money(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {p.invoices && (
                        <Link
                          to="/invoices/$id"
                          params={{ id: p.invoices.id }}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Invoice <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...t} />
      </Panel>
    </>
  );
}
