import { createFileRoute, redirect } from "@tanstack/react-router";
import { loadSession, homeFor } from "@/lib/auth";
import { Loading } from "@/components/common";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "SubscriptIQ — Brightloop Subscription Management" },
      { name: "description", content: "Subscriptions, recurring billing, invoices and payments in one place." },
      { property: "og:title", content: "SubscriptIQ — Brightloop Subscription Management" },
      { property: "og:description", content: "Subscriptions, recurring billing, invoices and payments in one place." },
    ],
  }),
  beforeLoad: async () => {
    const s = await loadSession();
    throw redirect({ to: s ? homeFor(s.role) : "/auth" });
  },
  component: () => <Loading />,
});
