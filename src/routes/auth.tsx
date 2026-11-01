import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { signIn as localSignIn } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common";
import { loadSession, homeFor } from "@/lib/auth";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — SubscriptIQ" },
      {
        name: "description",
        content: "Sign in to SubscriptIQ as an admin, staff member or customer.",
      },
      { property: "og:title", content: "Sign in — SubscriptIQ" },
      {
        property: "og:description",
        content: "Sign in to SubscriptIQ as an admin, staff member or customer.",
      },
    ],
  }),
  component: AuthPage,
});

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
    try {
      await localSignIn(email.trim(), password);
      await finish();
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-sidebar p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-display font-bold text-primary-foreground">
            S
          </div>
          <span className="font-display text-lg font-semibold text-sidebar-accent-foreground">
            SubscriptIQ
          </span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight text-sidebar-accent-foreground">
            Recurring revenue, run on autopilot.
          </h1>
          <p className="mt-4 max-w-md text-sidebar-foreground">
            Plans, subscriptions, invoices and payments for Brightloop Software — all in one
            workspace.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">© 2026 Brightloop Software</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your local workspace.</p>

          <div className="mt-5 rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Try the local demo</p>
            <p className="mt-1 text-muted-foreground">
              Password for all three accounts: <code>LocalDemo123!</code>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["admin", "staff", "customer"] as const).map((role) => (
                <Button
                  key={role}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail(`${role}@subscriptiq.local`);
                    setPassword("LocalDemo123!");
                  }}
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Button>
              ))}
            </div>
          </div>
          <form onSubmit={signIn} className="mt-6 grid gap-4">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                aria-label="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                aria-label="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={!!busy}>
              {busy === "form" && <Loader2 className="h-4 w-4 animate-spin" />}Sign in
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Staff accounts are created by an admin from Team & Roles.
          </p>
        </div>
      </div>
    </div>
  );
}
