import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Panel, Loading, Field, StatusBadge, tableHead } from "@/components/common";
import { useList, useAction, db } from "@/lib/data";
import { guard } from "@/lib/auth";
import { calcTotals, effectiveInvoiceStatus, fmtDate, money, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/subscriptions/$id")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Subscription — SubscriptIQ" }] }),
  component: SubEditor,
});

type Line = { product_id: string; variant_id: string | null; quantity: number; unit_price: number };
type Prod = { id: string; name: string; sales_price: number; product_variants: { id: string; name: string; extra_price: number }[] };
const STATUSES = ["draft", "quotation", "confirmed", "active", "paused", "closed"];
const blank = { customer_id: "", plan_id: "", status: "draft", start_date: todayISO(), expiry_date: "", payment_terms_days: 15, tax_rate: 18, discount_id: "none", notes: "" };

function SubEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { role } = useRouteContext({ from: "/_authenticated" });
  const customers = useList<{ id: string; name: string }>("customers", "id, name", "name", true);
  const plans = useList<{ id: string; name: string; billing_period: string; min_quantity: number }>("plans", "*", "name", true);
  const products = useList<Prod>("products", "id, name, sales_price, product_variants(id, name, extra_price)", "name", true);
  const discounts = useList<{ id: string; code: string; type: "fixed" | "percentage"; value: number; active: boolean }>("discounts");

  const sub = useQuery({
    queryKey: ["subscription", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await db.from("subscriptions").select("*, subscription_lines(*), invoices(id, number, period_start, period_end, total, status, due_date)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const [f, setF] = useState(blank);
  const [lines, setLines] = useState<Line[]>([]);
  useEffect(() => {
    if (sub.data) {
      const s = sub.data;
      setF({ customer_id: s.customer_id, plan_id: s.plan_id, status: s.status, start_date: s.start_date, expiry_date: s.expiry_date ?? "", payment_terms_days: s.payment_terms_days, tax_rate: Number(s.tax_rate), discount_id: s.discount_id ?? "none", notes: s.notes ?? "" });
      setLines(s.subscription_lines.map((l: Line) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity, unit_price: Number(l.unit_price) })));
    }
  }, [sub.data]);

  const plan = plans.data?.find((p) => p.id === f.plan_id);
  const disc = discounts.data?.find((d) => d.id === f.discount_id) ?? null;
  const totals = calcTotals(lines, f.tax_rate, disc);

  const priceFor = (pid: string, vid: string | null) => {
    const p = products.data?.find((x) => x.id === pid);
    if (!p) return 0;
    return Number(p.sales_price) + Number(p.product_variants.find((v) => v.id === vid)?.extra_price ?? 0);
  };
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, ...patch };
    if ("product_id" in patch) n.variant_id = null;
    if ("product_id" in patch || "variant_id" in patch) n.unit_price = priceFor(n.product_id, n.variant_id);
    return n;
  }));

  const save = useAction(async () => {
    const row = { customer_id: f.customer_id, plan_id: f.plan_id, status: f.status, start_date: f.start_date, expiry_date: f.expiry_date || null, payment_terms_days: Number(f.payment_terms_days), tax_rate: Number(f.tax_rate), discount_id: f.discount_id === "none" ? null : f.discount_id, notes: f.notes || null };
    let sid = id;
    if (isNew) { const r = await db.from("subscriptions").insert(row).select("id").single(); if (r.error) throw r.error; sid = r.data.id; }
    else { const r = await db.from("subscriptions").update(row).eq("id", id); if (r.error) throw r.error; const d = await db.from("subscription_lines").delete().eq("subscription_id", id); if (d.error) throw d.error; }
    const r = await db.from("subscription_lines").insert(lines.map((l) => ({ ...l, subscription_id: sid })));
    if (r.error) throw r.error;
    if (isNew) navigate({ to: "/subscriptions/$id", params: { id: sid }, replace: true });
  }, "Subscription saved");
  const del = useAction(async () => { const r = await db.from("subscriptions").delete().eq("id", id); if (r.error) throw r.error; navigate({ to: "/subscriptions" }); }, "Subscription deleted");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.customer_id || !f.plan_id) return void toast.error("Choose a customer and a plan");
    if (!f.start_date) return void toast.error("Start date is required");
    if (f.expiry_date && f.expiry_date < f.start_date) return void toast.error("Expiry must be after start date");
    if (lines.length === 0) return void toast.error("Add at least one line item");
    if (lines.some((l) => !l.product_id)) return void toast.error("Choose a product for every line");
    if (plan && lines.some((l) => l.quantity < plan.min_quantity)) return void toast.error(`Plan "${plan.name}" requires a minimum quantity of ${plan.min_quantity}`);
    if (f.tax_rate < 0 || f.tax_rate > 100) return void toast.error("Tax rate must be between 0 and 100");
    save.mutate(undefined);
  };

  if (!isNew && sub.isLoading) return <Loading />;
  if (!isNew && sub.error) return <p className="text-destructive">Subscription not found.</p>;

  return (
    <>
      <Link to="/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Subscriptions</Link>
      <PageHeader title={isNew ? "New subscription" : sub.data.number} subtitle={isNew ? "Set up a recurring agreement" : undefined}
        actions={!isNew && role === "admin" ? <Button variant="outline" onClick={() => confirm("Delete this subscription?") && del.mutate(undefined)}><Trash2 className="h-4 w-4 text-destructive" />Delete</Button> : undefined} />
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Panel className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Customer *">
              <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Plan *" hint={plan ? `Billed ${plan.billing_period} · min qty ${plan.min_quantity}` : undefined}>
              <Select value={f.plan_id} onValueChange={(v) => setF({ ...f, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>{plans.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Payment terms (days)"><Input type="number" min={0} value={f.payment_terms_days} onChange={(e) => setF({ ...f, payment_terms_days: Number(e.target.value) })} /></Field>
            <Field label="Start date *"><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
            <Field label="Expiry date"><Input type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} /></Field>
            <Field label="Tax rate (%)"><Input type="number" min={0} max={100} step="0.01" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: Number(e.target.value) })} /></Field>
            <Field label="Discount">
              <Select value={f.discount_id} onValueChange={(v) => setF({ ...f, discount_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">No discount</SelectItem>{discounts.data?.filter((d) => d.active || d.id === f.discount_id).map((d) => <SelectItem key={d.id} value={d.id}>{d.code} ({d.type === "fixed" ? money(d.value) : `${d.value}%`})</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2"><Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></Field></div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between border-b px-5 py-3"><h3 className="font-semibold">Line items</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => setLines([...lines, { product_id: "", variant_id: null, quantity: plan?.min_quantity ?? 1, unit_price: 0 }])}><Plus className="h-3.5 w-3.5" />Add line</Button></div>
            {lines.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">No line items yet.</p> : (
              <div className="grid gap-3 p-4">
                {lines.map((l, i) => {
                  const p = products.data?.find((x) => x.id === l.product_id);
                  return (
                    <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_1.5fr_80px_100px_100px_auto]">
                      <Field label="Product"><Select value={l.product_id} onValueChange={(v) => setLine(i, { product_id: v })}><SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger><SelectContent>{products.data?.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></Field>
                      <Field label="Variant"><Select value={l.variant_id ?? "none"} onValueChange={(v) => setLine(i, { variant_id: v === "none" ? null : v })} disabled={!p?.product_variants.length}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Base</SelectItem>{p?.product_variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} (+{money(v.extra_price)})</SelectItem>)}</SelectContent></Select></Field>
                      <Field label="Qty"><Input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Math.max(1, Number(e.target.value)) })} /></Field>
                      <Field label="Unit price"><Input type="number" min={0} step="0.01" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })} /></Field>
                      <div className="pb-2 text-right text-sm font-medium">{money(l.quantity * l.unit_price)}</div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel className="p-5">
            <h3 className="mb-3 font-semibold">Summary per period</h3>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd>−{money(totals.discount)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Tax ({f.tax_rate}%)</dt><dd>{money(totals.tax)}</dd></div>
              <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold"><dt>Total</dt><dd>{money(totals.total)}</dd></div>
            </dl>
            <Button className="mt-5 w-full" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save subscription"}</Button>
          </Panel>
          {!isNew && (
            <Panel>
              <h3 className="border-b px-5 py-3 font-semibold">Invoices</h3>
              {sub.data.invoices.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">No invoices yet. Activate the subscription and run billing.</p> : (
                <table className="w-full text-sm"><thead className={tableHead}><tr><th className="px-4 py-2 text-left">Invoice</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2" /></tr></thead>
                  <tbody>{[...sub.data.invoices].sort((a: { period_start: string }, b: { period_start: string }) => b.period_start.localeCompare(a.period_start)).map((iv: { id: string; number: string; period_start: string; total: number; status: string; due_date: string }) => (
                    <tr key={iv.id} className="border-t"><td className="px-4 py-2"><Link to="/invoices/$id" params={{ id: iv.id }} className="text-primary hover:underline">{iv.number}</Link><div className="text-xs text-muted-foreground">{fmtDate(iv.period_start)}</div></td><td className="px-4 py-2 text-right">{money(iv.total)}</td><td className="px-4 py-2 text-right"><StatusBadge status={effectiveInvoiceStatus(iv.status, iv.due_date)} /></td></tr>
                  ))}</tbody></table>
              )}
            </Panel>
          )}
        </div>
      </form>
    </>
  );
}
