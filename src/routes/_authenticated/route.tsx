import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { loadSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const s = await loadSession();
    if (!s) throw redirect({ to: "/auth" });
    return { user: s.user, role: s.role };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
