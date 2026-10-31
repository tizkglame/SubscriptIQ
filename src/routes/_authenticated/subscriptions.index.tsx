import { useCallback, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Panel, SearchBox, usePaged, Pager, EmptyState, Loading, StatusBadge, tableHead } from "@/components/common";
import { useList, useInvalidate, db } from "@/lib/data";
import { guard } from "@/lib/auth";
import { calcTotals, fmtDate, money, errMsg } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/subscriptions/")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Subscriptions — SubscriptIQ" }] }),
  component: Subs,
});

export type SubRow = {
  id: string; number: string; status: string; start_date: string; expiry_date: string | null; tax_rate: number;
  customers: { name: string } | null; plans: { name: string; billing_period: string } | null;
  discounts: { type: "fixed" | "percentage"; value: number } | null;
  subscription_lines: { quantity: number; unit_price: number }[];
};
export const SUB_SELECT = "*, customers(name), plans(name, billing_period), discounts(type, value), subscription_lines(quantity, unit_price)";
const STATUSES = ["draft", "quotation", "confirmed", "active", "paused", "closed"];

export function RunBillingButton() {
  const [busy, setBusy] = useState(false);
  const inv = useInvalidate();
  return (
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const { data, error } = await db.rpc("run_billing");
        if (error) throw error;
        toast.success(data > 0 ? `Generated ${data} invoice${data > 1 ? "s" : ""}` : "All active subscriptions are already billed for this period");
        inv();
      } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
    }}><Zap className="h-4 w-4" />{busy ? "Billing…" : "Run billing"}</Button>
  );
}

function Subs() {
  const navigate = useNavigate();
  const { data, isLoading } = useList<SubRow>("subscriptions", SUB_SELECT);
  const [status, setStatus] = useState("all");
  const filter = useCallback((s: SubRow, q: string) => (status === "all" || s.status === status) && (!q || s.number.toLowerCase().includes(q) || !!s.customers?.name.toLowerCase().includes(q) || !!s.plans?.name.toLowerCase().includes(q)), [status]);
  const t = usePaged(data, filter);

  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Recurring agreements with your customers" actions={<><RunBillingButton /><Button onClick={() => navigate({ to: "/subscriptions/$id", params: { id: "new" } })}><Plus className="h-4 w-4" />New subscription</Button></>} />
      <Panel>
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <SearchBox value={t.q} onChange={t.setQ} placeholder="Search number, customer, plan" />
          <Select value={status} onValueChange={(v) => { setStatus(v); t.setPage(1); }}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {isLoading ? <Loading /> : t.total === 0 ? <EmptyState title="No subscriptions match" hint="Try a different filter or create a new subscription." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className={tableHead}><tr><th className="px-4 py-2.5 text-left">Number</th><th className="px-4 py-2.5 text-left">Customer</th><th className="px-4 py-2.5 text-left">Plan</th><th className="px-4 py-2.5 text-left">Start</th><th className="px-4 py-2.5 text-left">Expiry</th><th className="px-4 py-2.5 text-right">Total / period</th><th className="px-4 py-2.5 text-left">Status</th></tr></thead>
            <tbody>{t.rows.map((s) => (
              <tr key={s.id} className="border-t hover:bg-muted/40">
                <td className="px-4 py-3"><Link to="/subscriptions/$id" params={{ id: s.id }} className="font-medium text-primary hover:underline">{s.number}</Link></td>
                <td className="px-4 py-3">{s.customers?.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.plans?.name} <span className="text-xs capitalize">· {s.plans?.billing_period}</span></td>
                <td className="px-4 py-3">{fmtDate(s.start_date)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(s.expiry_date)}</td>
                <td className="px-4 py-3 text-right font-medium">{money(calcTotals(s.subscription_lines, s.tax_rate, s.discounts).total)}</td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
              </tr>))}
            </tbody></table></div>
        )}
        <Pager {...t} />
      </Panel>
    </>
  );
}
