import { useCallback, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Panel, SearchBox, usePaged, Pager, EmptyState, Loading, Field, tableHead } from "@/components/common";
import { useList, useAction, db } from "@/lib/data";
import { guard } from "@/lib/auth";
import { z } from "zod";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Customers — SubscriptIQ" }] }),
  component: Customers,
});

type C = { id: string; name: string; email: string; phone: string | null; company: string | null; address: string | null; user_id: string | null };
const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Valid email required").max(255),
  phone: z.string().trim().max(30).optional(),
  company: z.string().trim().max(100).optional(),
  address: z.string().trim().max(300).optional(),
});
const empty = { name: "", email: "", phone: "", company: "", address: "" };

function Customers() {
  const { role } = useRouteContext({ from: "/_authenticated" });
  const { data, isLoading } = useList<C>("customers");
  const filter = useCallback((c: C, q: string) => !q || [c.name, c.email, c.company].some((v) => v?.toLowerCase().includes(q)), []);
  const t = usePaged(data, filter);
  const [edit, setEdit] = useState<Partial<C> | null>(null);
  const [form, setForm] = useState(empty);

  const save = useAction(async (v: typeof empty & { id?: string }) => {
    const { id, ...rest } = v;
    return id ? db.from("customers").update(rest).eq("id", id) : db.from("customers").insert(rest);
  }, "Customer saved", () => setEdit(null));
  const del = useAction((id: string) => db.from("customers").delete().eq("id", id), "Customer deleted");

  const open = (c?: C) => { setEdit(c ?? {}); setForm(c ? { name: c.name, email: c.email, phone: c.phone ?? "", company: c.company ?? "", address: c.address ?? "" } : empty); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = schema.safeParse(form);
    if (!r.success) return void toast.error(r.error.issues[0]?.message ?? "Invalid input");
    save.mutate({ name: r.data.name, email: r.data.email, phone: r.data.phone ?? "", company: r.data.company ?? "", address: r.data.address ?? "", ...(edit?.id ? { id: edit.id } : {}) });
  };

  return (
    <>
      <PageHeader title="Customers" subtitle="Accounts you bill" actions={<Button onClick={() => open()}><Plus className="h-4 w-4" />New customer</Button>} />
      <Panel>
        <div className="p-4"><SearchBox value={t.q} onChange={t.setQ} placeholder="Search name, email, company" /></div>
        {isLoading ? <Loading /> : t.total === 0 ? <EmptyState title="No customers found" hint="Add your first customer to start creating subscriptions." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tableHead}><tr><th className="px-4 py-2.5 text-left">Name</th><th className="px-4 py-2.5 text-left">Company</th><th className="px-4 py-2.5 text-left">Email</th><th className="px-4 py-2.5 text-left">Phone</th><th className="px-4 py-2.5 text-left">Portal</th><th /></tr></thead>
              <tbody>
                {t.rows.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.company ?? "—"}</td>
                    <td className="px-4 py-3">{c.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{c.user_id ? <span className="text-success">Linked</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => open(c)}><Pencil className="h-4 w-4" /></Button>
                      {role === "admin" && <Button size="icon" variant="ghost" onClick={() => confirm(`Delete ${c.name}?`) && del.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...t} />
      </Panel>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Email *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <Field label="Address"><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={save.isPending}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
