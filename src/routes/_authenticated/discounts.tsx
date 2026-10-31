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
import { fmtDate, money, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/discounts")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Discounts — SubscriptIQ" }] }),
  component: Discounts,
});

type D = { id: string; code: string; name: string; type: "fixed" | "percentage"; value: number; expires_on: string | null; usage_limit: number | null; used_count: number; active: boolean };
const blank = { code: "", name: "", type: "percentage" as "fixed" | "percentage", value: 10, expires_on: "", usage_limit: "", active: true };

function Discounts() {
  const { role } = useRouteContext({ from: "/_authenticated" });
  const { data, isLoading } = useList<D>("discounts");
  const filter = useCallback((d: D, q: string) => !q || d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q), []);
  const t = usePaged(data, filter);
  const [edit, setEdit] = useState<Partial<D> | null>(null);
  const [f, setF] = useState(blank);

  const save = useAction(async () => {
    const row = { code: f.code.trim().toUpperCase(), name: f.name.trim(), type: f.type, value: Number(f.value), expires_on: f.expires_on || null, usage_limit: f.usage_limit === "" ? null : Number(f.usage_limit), active: f.active };
    return edit?.id ? db.from("discounts").update(row).eq("id", edit.id) : db.from("discounts").insert(row);
  }, "Discount saved", () => setEdit(null));
  const del = useAction((id: string) => db.from("discounts").delete().eq("id", id), "Discount deleted");

  const open = (d?: D) => { setEdit(d ?? {}); setF(d ? { code: d.code, name: d.name, type: d.type, value: d.value, expires_on: d.expires_on ?? "", usage_limit: d.usage_limit == null ? "" : String(d.usage_limit), active: d.active } : blank); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.code.trim() || !f.name.trim()) return void toast.error("Code and name are required");
    if (!(Number(f.value) > 0)) return void toast.error("Value must be greater than 0");
    if (f.type === "percentage" && Number(f.value) > 100) return void toast.error("Percentage cannot exceed 100");
    save.mutate(undefined);
  };
  const state = (d: D) => !d.active ? "inactive" : d.expires_on && d.expires_on < todayISO() ? "expired" : d.usage_limit != null && d.used_count >= d.usage_limit ? "exhausted" : "active";

  return (
    <>
      <PageHeader title="Discounts" subtitle="Fixed and percentage promotions" actions={<Button onClick={() => open()}><Plus className="h-4 w-4" />New discount</Button>} />
      <Panel>
        <div className="p-4"><SearchBox value={t.q} onChange={t.setQ} /></div>
        {isLoading ? <Loading /> : t.total === 0 ? <EmptyState title="No discounts yet" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className={tableHead}><tr><th className="px-4 py-2.5 text-left">Code</th><th className="px-4 py-2.5 text-left">Name</th><th className="px-4 py-2.5 text-right">Value</th><th className="px-4 py-2.5 text-left">Expires</th><th className="px-4 py-2.5 text-right">Usage</th><th className="px-4 py-2.5 text-left">State</th><th /></tr></thead>
            <tbody>{t.rows.map((d) => { const s = state(d); return (
              <tr key={d.id} className="border-t hover:bg-muted/40">
                <td className="px-4 py-3 font-mono text-xs font-semibold">{d.code}</td>
                <td className="px-4 py-3">{d.name}</td>
                <td className="px-4 py-3 text-right">{d.type === "fixed" ? money(d.value) : `${d.value}%`}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(d.expires_on)}</td>
                <td className="px-4 py-3 text-right">{d.used_count}{d.usage_limit != null && ` / ${d.usage_limit}`}</td>
                <td className="px-4 py-3"><span className={s === "active" ? "text-success" : "text-muted-foreground"}>{s}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => open(d)}><Pencil className="h-4 w-4" /></Button>
                  {role === "admin" && <Button size="icon" variant="ghost" onClick={() => confirm(`Delete ${d.code}?`) && del.mutate(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </td>
              </tr>); })}
            </tbody></table></div>
        )}
        <Pager {...t} />
      </Panel>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit discount" : "New discount"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code *"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
              <Field label="Name *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Type">
                <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as "fixed" | "percentage" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="fixed">Fixed amount</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Value"><Input type="number" min="0" step="0.01" value={f.value} onChange={(e) => setF({ ...f, value: Number(e.target.value) })} /></Field>
              <Field label="Expires on"><Input type="date" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} /></Field>
              <Field label="Usage limit" hint="Blank = unlimited"><Input type="number" min="1" value={f.usage_limit} onChange={(e) => setF({ ...f, usage_limit: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />Active</label>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={save.isPending}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
