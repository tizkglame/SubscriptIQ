import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Repeat,
  FileText,
  AlertCircle,
  TrendingUp,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { PageHeader, Panel, Loading, StatusBadge } from "@/components/common";
import { RunBillingButton } from "@/routes/_authenticated/subscriptions.index";
import { db } from "@/lib/data";
import { guard } from "@/lib/auth";
import {
  calcTotals,
  effectiveInvoiceStatus,
  fmtDate,
  money,
  monthlyFactor,
  outstanding,
  type BillingPeriod,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: guard(["admin", "staff"]),
  head: () => ({ meta: [{ title: "Dashboard — SubscriptIQ" }] }),
  component: DashboardPage,
});

type DashboardData = {
  customers: { id: string; name: string; created_at: string }[];
  subscriptions: {
    id: string;
    number: string;
    status: string;
    start_date: string;
    tax_rate: number;
    plans: { name: string; billing_period: string } | null;
    discounts: { type: "fixed" | "percentage"; value: number } | null;
    subscription_lines: { quantity: number; unit_price: number }[];
  }[];
  invoices: {
    id: string;
    number: string;
    issue_date: string;
    due_date: string;
    total: number;
    status: string;
    customers: { name: string } | null;
    payments: { amount: number }[];
  }[];
  recentPayments: {
    id: string;
    amount: number;
    paid_on: string;
    method: string;
    invoices: {
      number: string;
      customers: { name: string } | null;
    } | null;
  }[];
};

function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      const [custRes, subRes, invRes, payRes] = await Promise.all([
        db.from("customers").select("id, name, created_at"),
        db
          .from("subscriptions")
          .select(
            "id, number, status, start_date, tax_rate, plans(name, billing_period), discounts(type, value), subscription_lines(quantity, unit_price)"
          ),
        db
          .from("invoices")
          .select(
            "id, number, issue_date, due_date, total, status, customers(name), payments(amount)"
          ),
        db
          .from("payments")
          .select(
            "id, amount, paid_on, method, invoices(number, customers(name))"
          )
          .order("paid_on", { ascending: false })
          .limit(5),
      ]);

      if (custRes.error) throw custRes.error;
      if (subRes.error) throw subRes.error;
      if (invRes.error) throw invRes.error;
      if (payRes.error) throw payRes.error;

      return {
        customers: custRes.data ?? [],
        subscriptions: subRes.data ?? [],
        invoices: invRes.data ?? [],
        recentPayments: payRes.data ?? [],
      } as DashboardData;
    },
  });

  const metrics = useMemo(() => {
    if (!data) return null;

    const totalCustomers = data.customers.length;
    const activeSubs = data.subscriptions.filter((s) => s.status === "active");
    const activeSubCount = activeSubs.length;

    // Monthly Recurring Revenue calculation
    const mrr = activeSubs.reduce((acc, sub) => {
      const lines = sub.subscription_lines ?? [];
      const taxRate = Number(sub.tax_rate ?? 0);
      const disc = sub.discounts ?? null;
      const { total } = calcTotals(lines, taxRate, disc);
      const period = (sub.plans?.billing_period as BillingPeriod) ?? "monthly";
      const factor = monthlyFactor[period] ?? 1;
      return acc + total * factor;
    }, 0);

    const arr = mrr * 12;

    const totalInvoices = data.invoices.length;
    const totalInvoiced = data.invoices.reduce(
      (acc, inv) => acc + Number(inv.total),
      0
    );

    // Outstanding balance across uncancelled invoices
    const totalOutstanding = data.invoices
      .filter((inv) => inv.status !== "cancelled")
      .reduce((acc, inv) => acc + outstanding(inv.total, inv.payments ?? []), 0);

    const overdueCount = data.invoices.filter(
      (inv) => effectiveInvoiceStatus(inv.status, inv.due_date) === "overdue"
    ).length;

    // Monthly Invoiced vs Collected
    const chartMap = new Map<
      string,
      { monthKey: string; month: string; invoiced: number; collected: number }
    >();

    for (const inv of data.invoices) {
      if (!inv.issue_date) continue;
      const monthKey = inv.issue_date.slice(0, 7);
      if (!chartMap.has(monthKey)) {
        const [y, m] = monthKey.split("-");
        const d = new Date(Number(y), Number(m) - 1, 1);
        const label = d.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        });
        chartMap.set(monthKey, {
          monthKey,
          month: label,
          invoiced: 0,
          collected: 0,
        });
      }
      const entry = chartMap.get(monthKey)!;
      entry.invoiced += Math.round(Number(inv.total));
      const paidOnInv = (inv.payments ?? []).reduce(
        (s, p) => s + Number(p.amount),
        0
      );
      entry.collected += Math.round(paidOnInv);
    }

    const chartData = Array.from(chartMap.values())
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .slice(-6);

    const recentInvoices = [...data.invoices]
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date))
      .slice(0, 5);

    return {
      totalCustomers,
      activeSubCount,
      totalSubs: data.subscriptions.length,
      mrr,
      arr,
      totalInvoices,
      totalInvoiced,
      totalOutstanding,
      overdueCount,
      chartData,
      recentInvoices,
      recentPayments: data.recentPayments,
    };
  }, [data]);

  if (isLoading) return <Loading />;
  if (error || !metrics) {
    return <p className="py-8 text-destructive">Failed to load dashboard metrics.</p>;
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Recurring revenue, subscription health and billing overview"
        actions={<RunBillingButton />}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Panel className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">MRR</span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {money(metrics.mrr)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            ARR: {money(metrics.arr)}
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Active Subs</span>
            <Repeat className="h-4 w-4 text-success" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {metrics.activeSubCount}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {metrics.totalSubs} total subscriptions
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Customers</span>
            <Users className="h-4 w-4 text-info" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {metrics.totalCustomers}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Subscriber accounts
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Total Invoices</span>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {metrics.totalInvoices}
          </div>
          <div className="mt-1 text-xs text-muted-foreground truncate">
            {money(metrics.totalInvoiced)} billed
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">Outstanding</span>
            <AlertCircle
              className={`h-4 w-4 ${
                metrics.overdueCount > 0 ? "text-destructive" : "text-muted-foreground"
              }`}
            />
          </div>
          <div
            className={`mt-2 text-2xl font-bold ${
              metrics.totalOutstanding > 0 ? "text-destructive" : "text-foreground"
            }`}
          >
            {money(metrics.totalOutstanding)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {metrics.overdueCount > 0
              ? `${metrics.overdueCount} invoice${metrics.overdueCount > 1 ? "s" : ""} overdue`
              : "All settled up"}
          </div>
        </Panel>
      </div>

      {/* Main Content: Chart + Recent Activity */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Revenue Trend Chart */}
        <Panel className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Revenue & Billing Trend</h3>
              <p className="text-xs text-muted-foreground">
                Monthly comparison of invoiced volume vs collections
              </p>
            </div>
            <Link
              to="/invoices"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Invoices <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={metrics.chartData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  formatter={(val: number) => [money(val), ""]}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: "10px", fontSize: "12px" }}
                />
                <Bar
                  dataKey="invoiced"
                  name="Invoiced"
                  fill="oklch(0.51 0.2 270)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="collected"
                  name="Collected"
                  fill="oklch(0.6 0.15 155)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Recent Payments Panel */}
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="font-semibold text-foreground">Recent Payments</h3>
              <p className="text-xs text-muted-foreground">Latest settled transactions</p>
            </div>
            <Link
              to="/payments"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ledger <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid gap-3">
            {metrics.recentPayments.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No payments recorded yet.
              </p>
            ) : (
              metrics.recentPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border p-2.5 text-xs"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {p.invoices?.customers?.name ?? "Customer"}
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CreditCard className="h-3 w-3" />
                      <span className="capitalize">{p.method.replace("_", " ")}</span>
                      <span>·</span>
                      <span>{fmtDate(p.paid_on)}</span>
                    </div>
                  </div>
                  <div className="text-right font-semibold text-success">
                    +{money(p.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {/* Recent Invoices Table */}
      <Panel className="mt-6">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="font-semibold text-foreground">Latest Invoices</h3>
            <p className="text-xs text-muted-foreground">
              Recent statements and their settlement status
            </p>
          </div>
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            All invoices <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Issue Date</th>
                <th className="px-4 py-2.5">Due Date</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {metrics.recentInvoices.map((inv) => (
                <tr key={inv.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to="/invoices/$id"
                      params={{ id: inv.id }}
                      className="text-primary hover:underline"
                    >
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {inv.customers?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmtDate(inv.issue_date)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmtDate(inv.due_date)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {money(inv.total)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={effectiveInvoiceStatus(inv.status, inv.due_date)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
