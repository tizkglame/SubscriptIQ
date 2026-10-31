import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/common";
import { useAction, db } from "@/lib/data";
import { money, todayISO } from "@/lib/format";

export const METHODS = ["card", "bank_transfer", "upi", "paypal", "cash"];

export function PaymentDialog({ invoice, balance, onClose }: { invoice: { id: string; number: string } | null; balance: number; onClose: () => void }) {
  const [f, setF] = useState({ amount: "", method: "card", paid_on: todayISO(), notes: "" });
  useEffect(() => { if (invoice) setF({ amount: String(balance), method: "card", paid_on: todayISO(), notes: "" }); }, [invoice, balance]);
  const save = useAction(
    () => db.from("payments").insert({ invoice_id: invoice!.id, amount: Number(f.amount), method: f.method, paid_on: f.paid_on, notes: f.notes || null, is_demo: true }),
    "Payment recorded", onClose,
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = Number(f.amount);
    if (!(a > 0)) return void toast.error("Amount must be greater than 0");
    if (a > balance + 0.001) return void toast.error(`Amount exceeds outstanding balance of ${money(balance)}`);
    save.mutate(undefined);
  };
  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment · {invoice?.number}</DialogTitle>
          <DialogDescription>Demo mode — payments are simulated, no real charge is made. Outstanding: {money(balance)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount"><Input type="number" step="0.01" min="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Method">
              <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date"><Input type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.isPending}>Record payment</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
