import { useCallback, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Panel, SearchBox, usePaged, Pager, EmptyState, Loading, Field, tableHead } from "@/components/common";
import { useList, useAction, db } from "@/lib/data";
import { guard } from "@/lib/auth";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Products — SubscriptIQ" }] }),
  component: Products,
});

type V = { id?: string; name: string; extra_price: number };
type P = { id: string; name: string; type: string; sales_price: number; cost_price: number; product_variants: V[] };

function Products() {
  const { role } = useRouteContext({ from: "/_authenticated" });
  const { data, isLoading } = useList<P>("products", "*, product_variants(*)");
  const filter = useCallback((p: P, q: string) => !q || p.name.toLowerCase().includes(q) || p.type.includes(q), []);
  const t = usePaged(data, filter);
  const [edit, setEdit] = useState<Partial<P> | null>(null);
  const [form, setForm] = useState({ name: "", type: "software", sales_price: "0", cost_price: "0" });
  const [variants, setVariants] = useState<V[]>([]);

  const open = (p?: P) => {
    setEdit(p ?? {});
    setForm(p ? { name: p.name, type: p.type, sales_price: String(p.sales_price), cost_price: String(p.cost_price) } : { name: "", type: "software", sales_price: "0", cost_price: "0" });
    setVariants(p?.product_variants.map((v) => ({ ...v })) ?? []);
  };

  const save = useAction(async () => {
    const row = { name: form.name.trim(), type: form.type, sales_price: Number(form.sales_price), cost_price: Number(form.cost_price) };
    let id = edit?.id;
    if (id) { const r = await db.from("products").update(row).eq("id", id); if (r.error) throw r.error; }
    else { const r = await db.from("products").insert(row).select("id").single(); if (r.error) throw r.error; id = r.data.id; }
    const keep = variants.filter((v) => v.id).map((v) => v.id);
    const old = edit?.product_variants?.map((v) => v.id).filter((x) => !keep.includes(x)) ?? [];
    if (old.length) { const r = await db.from("product_variants").delete().in("id", old); if (r.error) throw r.error; }
    for (const v of variants) {
      const r = v.id ? await db.from("product_variants").update({ name: v.name, extra_price: Number(v.extra_price) }).eq("id", v.id)
        : await db.from("product_variants").insert({ product_id: id, name: v.name, extra_price: Number(v.extra_price) });
      if (r.error) throw r.error;
    }
  }, "Product saved", () => setEdit(null));
  const del = useAction((id: string) => db.from("products").delete().eq("id", id), "Product deleted");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return void toast.error("Name is required");
    if (Number(form.sales_price) < 0 || Number(form.cost_price) < 0 || isNaN(Number(form.sales_price))) return void toast.error("Prices must be positive numbers");
    if (variants.some((v) => !v.name.trim())) return void toast.error("Each variant needs a name");
    save.mutate(undefined);
  };

  return (
    <>
      <PageHeader title="Products" subtitle="What you sell, with variants" actions={<Button onClick={() => open()}><Plus className="h-4 w-4" />New product</Button>} />
      <Panel>
        <div className="p-4"><SearchBox value={t.q} onChange={t.setQ} /></div>
        {isLoading ? <Loading /> : t.total === 0 ? <EmptyState title="No products yet" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className={tableHead}><tr><th className="px-4 py-2.5 text-left">Product</th><th className="px-4 py-2.5 text-left">Type</th><th className="px-4 py-2.5 text-right">Sales price</th><th className="px-4 py-2.5 text-right">Cost</th><th className="px-4 py-2.5 text-right">Margin</th><th className="px-4 py-2.5 text-left">Variants</th><th /></tr></thead>
            <tbody>{t.rows.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/40">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{p.type}</td>
                <td className="px-4 py-3 text-right">{money(p.sales_price)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{money(p.cost_price)}</td>
                <td className="px-4 py-3 text-right text-success">{p.sales_price > 0 ? Math.round(((p.sales_price - p.cost_price) / p.sales_price) * 100) : 0}%</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{p.product_variants.map((v) => `${v.name} (+${money(v.extra_price)})`).join(", ") || "—"}</td>
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
          <DialogHeader><DialogTitle>{edit?.id ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Type">
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["software", "service", "goods"].map((x) => <SelectItem key={x} value={x} className="capitalize">{x}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Sales price"><Input type="number" min="0" step="0.01" value={form.sales_price} onChange={(e) => setForm({ ...form, sales_price: e.target.value })} /></Field>
              <Field label="Cost price"><Input type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></Field>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between"><span className="text-sm font-medium">Variants</span><Button type="button" size="sm" variant="outline" onClick={() => setVariants([...variants, { name: "", extra_price: 0 }])}><Plus className="h-3.5 w-3.5" />Add</Button></div>
              {variants.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Variant name" value={v.name} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <Input className="w-32" type="number" step="0.01" placeholder="+ price" value={v.extra_price} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, extra_price: Number(e.target.value) } : x))} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => setVariants(variants.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={save.isPending}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
