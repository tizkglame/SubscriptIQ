import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ShieldCheck, Briefcase, UserCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common";
import { DEMO_PASSWORD } from "@/lib/demo.functions";
import { loadSession, homeFor, type Role } from "@/lib/auth";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — SubscriptIQ" },
      { name: "description", content: "Sign in to SubscriptIQ as an admin, staff member or customer." },
      { property: "og:title", content: "Sign in — SubscriptIQ" },
      { property: "og:description", content: "Sign in to SubscriptIQ as an admin, staff member or customer." },
    ],
  }),
  component: AuthPage,
});

const DEMO_EMAILS: Record<Role, string> = {
  admin: "admin@brightloop.demo",
  staff: "staff@brightloop.demo",
  customer: "customer@brightloop.demo",
};

const demos: { role: Role; label: string; desc: string; icon: typeof ShieldCheck }[] = [
  { role: "admin", label: "Admin", desc: "Full access, manage team", icon: ShieldCheck },
  { role: "staff", label: "Staff", desc: "Billing & operations", icon: Briefcase },
  { role: "customer", label: "Customer", desc: "Self-service portal", icon: UserCircle },
];

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function finish() {
    const s = await loadSession();
    if (s) navigate({ to: homeFor(s.role), replace: true });
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy("form");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(null);
    if (error) return void toast.error(error.message);
    await finish();
  }

  async function demo(role: Role) {
    setBusy(role);
    try {
      const email = DEMO_EMAILS[role];
      const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
      if (error) throw error;
      await finish();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-sidebar p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-display font-bold text-primary-foreground">S</div>
          <span className="font-display text-lg font-semibold text-sidebar-accent-foreground">SubscriptIQ</span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight text-sidebar-accent-foreground">Recurring revenue, run on autopilot.</h1>
          <p className="mt-4 max-w-md text-sidebar-foreground">Plans, subscriptions, invoices and payments for Brightloop Software — all in one workspace.</p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">© 2026 Brightloop Software</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Try a demo account or sign in with your credentials.</p>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {demos.map((d) => (
              <button key={d.role} onClick={() => demo(d.role)} disabled={!!busy}
                className="flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left shadow-card transition hover:border-primary hover:bg-accent disabled:opacity-60">
                {busy === d.role ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <d.icon className="h-5 w-5 text-primary" />}
                <span className="text-sm font-semibold">Demo {d.label}</span>
                <span className="text-xs text-muted-foreground">{d.desc}</span>
              </button>
            ))}
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" /></div>

          <form onSubmit={signIn} className="grid gap-4">
            <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Button type="submit" disabled={!!busy}>{busy === "form" && <Loader2 className="h-4 w-4 animate-spin" />}Sign in</Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">Staff accounts are created by an admin from Team & Roles.</p>
        </div>
      </div>
    </div>
  );
}
