import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, UserPlus, Info, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PageHeader,
  Panel,
  SearchBox,
  usePaged,
  Pager,
  EmptyState,
  Loading,
  Field,
  tableHead,
} from "@/components/common";
import { createStaff } from "@/lib/staff.functions";
import { useInvalidate, db, readAll } from "@/lib/data";
import { guard } from "@/lib/auth";
import { fmtDate, errMsg } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/staff")({
  beforeLoad: guard(["admin"]),
  head: () => ({ meta: [{ title: "Team & Roles — SubscriptIQ" }] }),
  component: StaffPage,
});

type TeamMember = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  createdAt: string;
};

function StaffPage() {
  const inv = useInvalidate();
  const createStaffFn = useServerFn(createStaff);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-team-list"],
    throwOnError: true,
    queryFn: async () => {
      const [profRes, roleRes] = await Promise.all([
        readAll("profiles"),
        readAll("user_roles", "*", "id"),
      ]);

      const profiles = profRes;
      const roles = roleRes;

      const list: TeamMember[] = profiles.map(
        (p: { id: string; email: string; full_name: string; created_at: string }) => {
          const userRoles = roles
            .filter((r: { user_id: string; role: string }) => r.user_id === p.id)
            .map((r: { role: string }) => r.role);
          return {
            id: p.id,
            email: p.email ?? "",
            fullName: p.full_name || p.email?.split("@")[0] || "User",
            roles: userRoles.length > 0 ? userRoles : ["customer"],
            createdAt: p.created_at,
          };
        },
      );

      return list;
    },
  });

  const [roleFilter, setRoleFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "staff" as "staff" | "admin",
  });

  const filter = useCallback(
    (m: TeamMember, q: string) => {
      const matchesRole = roleFilter === "all" || m.roles.includes(roleFilter);
      const matchesQuery =
        !q || m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
      return matchesRole && matchesQuery;
    },
    [roleFilter],
  );

  const t = usePaged(data, filter);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim() || !form.password) {
      return void toast.error("Please fill in all fields.");
    }
    if (form.password.length < 8) {
      return void toast.error("Password must be at least 8 characters.");
    }

    setBusy(true);
    try {
      await createStaffFn({
        data: {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        },
      });
      toast.success(`Team member ${form.fullName} created successfully.`);
      inv();
      setOpen(false);
      setForm({ fullName: "", email: "", password: "", role: "staff" });
    } catch (e) {
      const msg = errMsg(e);
      if (
        msg.includes("SUPABASE_SERVICE_ROLE_KEY") ||
        msg.includes("Missing Supabase environment")
      ) {
        toast.error("Service role key missing", {
          description:
            "Automated account creation requires SUPABASE_SERVICE_ROLE_KEY in .env. You can add users directly via the Supabase Auth Dashboard.",
          duration: 6000,
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Team & Roles"
        subtitle="Manage administrator and staff access to the billing platform"
        actions={
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add team member
          </Button>
        }
      />

      <Panel>
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <SearchBox value={t.q} onChange={t.setQ} placeholder="Search team member name or email" />
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v);
              t.setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admins only</SelectItem>
              <SelectItem value="staff">Staff only</SelectItem>
              <SelectItem value="customer">Customers</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Loading />
        ) : t.total === 0 ? (
          <EmptyState
            title="No team members found"
            hint="Try adjusting your filter or search query."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-2.5 text-left">Name</th>
                  <th className="px-4 py-2.5 text-left">Email</th>
                  <th className="px-4 py-2.5 text-left">Roles</th>
                  <th className="px-4 py-2.5 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {t.rows.map((m) => (
                  <tr key={m.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium text-foreground">{m.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.roles.map((r) => (
                          <span
                            key={r}
                            className={`rounded px-2 py-0.5 text-xs font-semibold capitalize ${
                              r === "admin"
                                ? "bg-primary/10 text-primary"
                                : r === "staff"
                                  ? "bg-info/15 text-info"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmtDate(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...t} />
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Create an administrative or operational staff login.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="grid gap-4 pt-1">
            <Field label="Full Name *">
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Jane Smith"
                required
              />
            </Field>

            <Field label="Email *">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@brightloop.demo"
                required
              />
            </Field>

            <Field label="Temporary Password *">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Minimum 8 characters"
                minLength={8}
                required
              />
            </Field>

            <Field label="Role *">
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as "staff" | "admin" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff (Billing & Operations)</SelectItem>
                  <SelectItem value="admin">Admin (Full Access)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Create member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
