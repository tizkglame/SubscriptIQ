# SubscriptIQ

Subscription management for Brightloop Software, built with React, TanStack Start, Supabase and PostgreSQL. Admins manage the team; admins and staff manage the catalog, customers, subscriptions, invoices and offline payment records. Customers have a read-only account portal.

## Local development

Use Node.js 22.13 or later and npm. Both lockfiles are maintained for the connected Lovable/Bun workflow; CI uses `package-lock.json`.

```sh
git clone https://github.com/tizkglame/SubscriptIQ.git
cd SubscriptIQ
cp .env.example .env
npm ci
npm run dev
```

Fill in the Supabase URL and publishable key in `.env`. The `VITE_*` values are public browser configuration. Set the corresponding server values for authenticated server functions. `SUPABASE_SERVICE_ROLE_KEY` is server-only and is required to provision team accounts; never prefix it with `VITE_` or commit it.

## Database and accounts

Use a Supabase project: the migrations depend on `auth.users`, `auth.uid()` and Supabase roles. Set `LOVABLE_DB_MIGRATION_URL` to the direct/session PostgreSQL connection, then run:

```sh
npm run db:migrate
```

The CLI loads `.env` and applies the migration journal in order. On an existing Lovable database whose original SQL was applied outside Drizzle, use its existing migration mechanism to apply **only** `drizzle/migrations/0001_audit_fixes.sql`; do not replay `0000_migration.sql`. Back up the database before applying migrations. The original migration includes sample billing records.

Apply the audit migration **before** deploying this app update: the editors require the new `save_subscription`, `save_product` and `list_products` RPCs. The migration revokes access from the three publicly shared `@brightloop.demo` accounts; use individual accounts instead. It does not delete auth users or existing financial records. New constraints preserve legacy rows with `NOT VALID`, but reject invalid new/updated records. Review and reconcile invalid legacy rows before validating the constraints.

Bootstrap the first admin by creating an individually owned, confirmed user in Supabase Auth, then run this in the Supabase SQL editor with its actual user ID:

```sql
insert into public.user_roles (user_id, role)
values ('<auth-user-uuid>', 'admin')
on conflict (user_id, role) do nothing;
```

That admin can add team members from **Team & Roles**. Provision customer users through Supabase Auth and explicitly link each to its billing account:

```sql
update public.customers set user_id = '<auth-user-uuid>'
where id = '<customer-uuid>';
```

Email matching alone does not grant customer access. Row-level security controls records; the staff-only product RPC protects internal cost prices.

## Billing behavior

**Run billing** generates all missing due periods for active subscriptions, through the expiry date. Period boundaries remain anchored to the original start date, including month ends and leap years. Repeated runs do not duplicate invoices. If legacy invoice dates overlap a corrected period, billing stops with a reconciliation error instead of creating overlapping charges. Backfilled invoices use their period start as the issue date, so missed periods may already be overdue. Review a subscription's start date and status before activating it. Plans can automatically close expired subscriptions.

Payment recording is an offline ledger entry by staff. This app does not charge cards or process payments. The customer portal directs users to billing instead of offering a payment action it cannot authorize. Product and subscription edits are transactional; a failed line/variant save rolls back the whole edit.

## Verification

```sh
npm run check:deps
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

Database regression tests require an isolated PostgreSQL server whose login has `CREATEDB` and permission to create the test roles:

```sh
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```

The tests create and drop a uniquely named database, install a minimal Supabase Auth test harness, and exercise real migrations, role policies, rollback, billing and concurrency. Never point them at a production server. CI runs these checks against PostgreSQL 17. See [AUDIT.md](AUDIT.md) for findings and verification limits.

## Dependency maintenance

Update `@tanstack/react-start`, `@tanstack/react-router` and `@tanstack/router-plugin` together and regenerate both lockfiles. TanStack Start pins a router version internally; the app and framework must resolve the same router copy so they share React contexts. `npm run check:deps` verifies that requirement after a clean install, and CI runs it before the application checks.

The TypeScript toolchain currently uses the supported 6.0.x line. `typescript-eslint@8.72` requires TypeScript `>=4.8.4 <6.1.0`, so Dependabot groups the compiler/parser updates and excludes TypeScript 6.1 and newer until parser support is reviewed. TypeScript 7 cannot currently be installed with the existing parser peer requirements. Keep npm peer checks enabled when updating dependencies.

## Lovable

Continue editing in the [connected Lovable project](https://lovable.dev/projects/de564323-4dad-4ac7-a7a8-c64cea3d3856). Changes on the connected branch sync to Lovable. Preserve published Git history as described in `AGENTS.md`.
