# SubscriptIQ

Subscription Management System for Brightloop Software.

SubscriptIQ is designed to manage the entire subscription lifecycle for Brightloop, from product catalog setup and customer accounts to billing periods, team role management, and subscription tracking. It brings together admin workflows, staff operations, and customer-facing billing access in a single app built with React, TanStack Start, Supabase, and PostgreSQL.

## Demo video

[Watch the project demo](https://drive.google.com/file/d/1YORVE_Ce8KEgYlrShs8OvlYLizQ3uG8L/view?usp=share_link)

## Highlights

- Subscription and renewal tracking for active customers
- Product catalog management for admins and staff
- Customer lifecycle management with linked billing accounts
- Team and role-based access for internal users
- Billing period generation and offline payment recording
- Row-level security and protected internal pricing controls
- Built with a modern TypeScript frontend and PostgreSQL-backed data layer

## Tech stack

- Frontend: React, TypeScript, Vite
- App framework: TanStack Start
- Database & auth: Supabase + PostgreSQL
- ORM/migrations: Drizzle
- Styling: Tailwind CSS
- Testing: Vitest, TypeScript checks, database validation scripts

## Local development

Use Node.js 22.13 or later and npm. CI uses `package-lock.json`.

```sh
git clone https://github.com/tizkglame/SubscriptIQ.git
cd SubscriptIQ
cp .env.example .env
npm ci
npm run dev
```

Fill in the Supabase URL and publishable key in `.env`. The `VITE_*` values are public browser configuration. Set the corresponding server values for authenticated server functions. `SUPABASE_SERVICE_ROLE_KEY` and related server variables must be available to trusted backend logic.

## Database and accounts

Use a Supabase project: the migrations depend on `auth.users`, `auth.uid()` and Supabase roles. Set the direct/session PostgreSQL connection in your environment, then run:

```sh
npm run db:migrate
```

The CLI loads `.env` and applies the migration journal in order. On an existing database whose original SQL was applied outside Drizzle, use its existing migration mechanism to apply only the Drizzle migration files needed for this app.

Apply the audit migration before deploying this app update: the editors require the new `save_subscription`, `save_product` and `list_products` RPCs. The migration revokes access from the three editor roles before forcing an app-level check on `public.user_roles`.

Bootstrap the first admin by creating an individually owned, confirmed user in Supabase Auth, then run this in the Supabase SQL editor with its actual user ID:

```sql
insert into public.user_roles (user_id, role)
values ('<auth-user-uuid>', 'admin')
on conflict (user_id, role) do nothing;
```

That admin can add team members from Team & Roles. Provision customer users through Supabase Auth and explicitly link each to its billing account:

```sql
update public.customers set user_id = '<auth-user-uuid>'
where id = '<customer-uuid>';
```

Email matching alone does not grant customer access. Row-level security controls records; the staff-only product RPC protects internal cost prices.

## Billing behavior

Run Billing generates all missing due periods for active subscriptions through the expiry date. Period boundaries remain anchored to the original start date, including month ends and leap years.

Payment recording is an offline ledger entry by staff. This app does not charge cards or process payments. The customer portal directs users to billing instead of offering a payment action it cannot complete.

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

The tests create and drop a uniquely named database, install a minimal Supabase Auth test harness, and exercise real migrations, role policies, rollback, billing and concurrency. Never point them at a production database.

## Dependency maintenance

Update `@tanstack/react-start`, `@tanstack/react-router` and `@tanstack/router-plugin` together and regenerate both lockfiles. TanStack Start pins a router version internally; the app and framework must stay aligned.

The TypeScript toolchain currently uses the supported 6.0.x line. `typescript-eslint@8.72` requires TypeScript `>=4.8.4 <6.1.0`, so Dependabot groups the compiler/parser updates and excludes TypeScript major bumps outside the supported range.

## Project status

This project is focused on subscription operations for Brightloop Software and is structured to support both internal administration and customer-facing billing workflows.
