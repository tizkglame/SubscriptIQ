import { useCallback, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Panel, SearchBox, usePaged, Pager, EmptyState, Loading, Field, tableHead } from "@/components/common";
import { useList, useAction, db } from "@/lib/data";
import { guard } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/plans")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Plans — SubscriptIQ" }] }),
  component: Plans,
});

type P = { id: string; name: string; billing_period: string; min_quantity: number; start_date: string | null; end_date: string | null; auto_close: boolean; closable: boolean; pausable: boolean; renewable: boolean };
const blank = { name: "", billing_period: "monthly", min_quantity: 1, start_date: "", end_date: "", auto_close: false, closable: true, pausable: true, renewable: true };
const flags = ["auto_close", "closable", "pausable", "renewable"] as const;

function Plans() {
  const { role } = useRouteContext({ from: "/_authenticated" });
  const { data, isLoading } = useList<P>("plans");
  const filter = useCallback((p: P, q: string) => !q || p.name.toLowerCase().includes(q) || p.billing_period.includes(q), []);
  const t = usePaged(data, filter);
  const [edit, setEdit] = useState<Partial<P> | null>(null);
  const [f, setF] = useState(blank);

  const save = useAction(async () => {
    const row = { ...f, name: f.name.trim(), start_date: f.start_date || null, end_date: f.end_date || null, min_quantity: Number(f.min_quantity) };
    return edit?.id ? db.from("plans").update(row).eq("id", edit.id) : db.from("plans").insert(row);
  }, "Plan saved", () => setEdit(null));
  const del = useAction((id: string) => db.from("plans").delete().eq("id", id), "Plan deleted");

  const open = (p?: P) => { setEdit(p ?? {}); setF(p ? { ...blank, ...p, start_date: p.start_date ?? "", end_date: p.end_date ?? "" } : blank); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return void toast.error("Name is required");
    if (Number(f.min_quantity) < 1) return void toast.error("Minimum quantity must be at least 1");
    if (f.start_date && f.end_date && f.end_date < f.start_date) return void toast.error("End date must be after start date");
    save.mutate(undefined);
  };

  return (
    <>
      <PageHeader title="Plans" subtitle="Billing cadence and lifecycle rules" actions={<Button onClick={() => open()}><Plus className="h-4 w-4" />New plan</Button>} />
      <Panel>
        <div className="p-4"><SearchBox value={t.q} onChange={t.setQ} /></div>
        {isLoading ? <Loading /> : t.total === 0 ? <EmptyState title="No plans yet" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className={tableHead}><tr><th className="px-4 py-2.5 text-left">Plan</th><th className="px-4 py-2.5 text-left">Billing</th><th className="px-4 py-2.5 text-right">Min qty</th><th className="px-4 py-2.5 text-left">Valid</th><th className="px-4 py-2.5 text-left">Lifecycle</th><th /></tr></thead>
            <tbody>{t.rows.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/40">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 capitalize">{p.billing_period}</td>
                <td className="px-4 py-3 text-right">{p.min_quantity}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.start_date)} → {p.end_date ? fmtDate(p.end_date) : "open"}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{flags.filter((k) => p[k]).map((k) => <span key={k} className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">{k.replace("_", " ")}</span>)}</div></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => open(p)}><Pencil className="h-4 w-4" /></Button>
                  {role === "admin" && <Button size="icon" variant="ghost" onClick={() => confirm(`Delete ${p.name}?`) && del.mutate(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </td>
              </tr>))}
            </tbody></table></div>
        )}
        <Pager {...t} />
      </Panel>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit plan" : "New plan"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Billing period">
                <Select value={f.billing_period} onValueChange={(v) => setF({ ...f, billing_period: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["daily", "weekly", "monthly", "yearly"].map((x) => <SelectItem key={x} value={x} className="capitalize">{x}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Minimum quantity"><Input type="number" min={1} value={f.min_quantity} onChange={(e) => setF({ ...f, min_quantity: Number(e.target.value) })} /></Field>
              <div />
              <Field label="Start date"><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
              <Field label="End date"><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
              {flags.map((k) => (
                <label key={k} className="flex items-center justify-between gap-2 text-sm capitalize">{k.replace("_", " ")}<Switch checked={f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v })} /></label>
              ))}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={save.isPending}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
