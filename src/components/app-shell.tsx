import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Users, Package, CalendarRange, Repeat, FileText, Wallet, BadgePercent, ShieldCheck, LogOut, Menu, X, UserCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth";

const NAV: { to: string; label: string; icon: typeof Users; roles: Role[] }[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "staff"] },
  { to: "/subscriptions", label: "Subscriptions", icon: Repeat, roles: ["admin", "staff"] },
  { to: "/invoices", label: "Invoices", icon: FileText, roles: ["admin", "staff"] },
  { to: "/payments", label: "Payments", icon: Wallet, roles: ["admin", "staff"] },
  { to: "/customers", label: "Customers", icon: Users, roles: ["admin", "staff"] },
  { to: "/products", label: "Products", icon: Package, roles: ["admin", "staff"] },
  { to: "/plans", label: "Plans", icon: CalendarRange, roles: ["admin", "staff"] },
  { to: "/discounts", label: "Discounts", icon: BadgePercent, roles: ["admin", "staff"] },
  { to: "/staff", label: "Team & Roles", icon: ShieldCheck, roles: ["admin"] },
  { to: "/portal", label: "My Account", icon: UserCircle, roles: ["customer"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { role, user } = useRouteContext({ from: "/_authenticated" });
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.filter((n) => n.roles.includes(role)).map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
        >
          <n.icon className="h-4 w-4" />
          {n.label}
        </Link>
      ))}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar py-5">
      <div className="mb-8 flex items-center gap-2.5 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand font-display text-sm font-bold text-primary-foreground">S</div>
        <div>
          <div className="font-display text-base font-semibold text-sidebar-accent-foreground">SubscriptIQ</div>
          <div className="text-[11px] text-sidebar-foreground/60">Brightloop Software</div>
        </div>
      </div>
      {nav}
      <div className="mx-3 mt-4 rounded-lg border border-sidebar-border p-3">
        <div className="truncate text-sm font-medium text-sidebar-accent-foreground">{user.email}</div>
        <div className="mb-2 text-xs capitalize text-sidebar-primary">{role}</div>
        <button onClick={signOut} className="flex items-center gap-2 text-xs text-sidebar-foreground hover:text-sidebar-accent-foreground">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button>
          <span className="font-display font-semibold">SubscriptIQ</span>
        </header>
        <main className={cn("mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8")}>{children}</main>
      </div>
    </div>
  );
}
