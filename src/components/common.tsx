import { useMemo, useState, type ReactNode } from "react";
import { Search, Inbox, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string | undefined; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  active: "bg-success/12 text-success ring-success/25",
  paid: "bg-success/12 text-success ring-success/25",
  confirmed: "bg-info/12 text-info ring-info/25",
  quotation: "bg-accent text-accent-foreground ring-primary/20",
  draft: "bg-muted text-muted-foreground ring-border",
  paused: "bg-warning/15 text-warning ring-warning/30",
  overdue: "bg-destructive/10 text-destructive ring-destructive/25",
  cancelled: "bg-muted text-muted-foreground ring-border line-through",
  closed: "bg-secondary text-secondary-foreground ring-border",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset", statusStyles[status] ?? statusStyles["draft"])}>
      {status}
    </span>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border bg-card shadow-card", className)}>{children}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Search…"} />
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground"><Inbox className="h-5 w-5" /></div>
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

export function usePaged<T>(items: T[] | undefined, filter: (item: T, q: string) => boolean, pageSize = 10) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => (items ?? []).filter((i) => filter(i, q.trim().toLowerCase())), [items, q, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  return {
    q, setQ: (v: string) => { setQ(v); setPage(1); },
    rows: filtered.slice((cur - 1) * pageSize, cur * pageSize),
    total: filtered.length, page: cur, pages, setPage,
  };
}

export function Pager({ page, pages, total, setPage }: { page: number; pages: number; total: number; setPage: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
      <span>{total} record{total === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span>Page {page} of {pages}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string | undefined }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const tableHead = "bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground";
