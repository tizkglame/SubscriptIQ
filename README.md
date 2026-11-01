# SubscriptIQ

Subscription management for Brightloop Software: catalog, customers, plans, discounts, subscriptions, invoices, offline payments, team roles and a customer portal. Everything runs locally with React, TanStack Router, a Node.js API and PostgreSQL. No cloud account, API keys or `.env` file are needed for the Docker setup.

## Live project

**[Open SubscriptIQ on GitHub Pages](https://tizkglame.github.io/SubscriptIQ/)**

The live demo opens as admin with sample customers, products, plans, subscriptions and invoices. Try the catalog editors, billing, payment recording and team/customer accounts. Sign out to switch to the staff or customer sample account; all three use `LocalDemo123!`.

Each visitor gets a separate browser database. Demo edits and the selected account persist across refreshes and tabs in that browser; **Reset demo** restores the sample data. No API keys, backend connection or installation are needed. This is a preview workspace with simulated sign-in, not a hosted shared business database. Use Docker below for the full server-backed application.

### Publish updates to the demo

GitHub Pages is configured to publish `main:/docs`. The generated HTML, JavaScript, fonts and browser database runtime are committed there so deployment works with ordinary repository write access.

```sh
npm ci
npm run pages:prepare
# Commit source changes and the regenerated docs/ together, then push main.
```

CI rebuilds the demo and checks that `docs/` matches its source. Keep `docs/assets` and `docs/index.html` generated. A push containing the updated `docs/` automatically triggers the repository's Pages deployment. The demo uses hash routes so direct links and refreshes work under `/SubscriptIQ/`.

Preview the static build locally:

```sh
npm run build:pages
npm run preview:pages
# Open http://localhost:4173/SubscriptIQ/
```

## Run with Docker (recommended)

Install and start [Docker Desktop](https://docs.docker.com/desktop/) or Docker Engine with Compose v2. Then:

```sh
git clone https://github.com/tizkglame/SubscriptIQ.git
cd SubscriptIQ
docker compose up --build -d --wait
```

Open **http://localhost:3000**. The first build downloads the dependencies and container images. Startup waits for PostgreSQL, applies versioned migrations, creates sample accounts and billing data, and checks the API before reporting healthy. Later starts reuse the database volume and do not duplicate sample data.

### Sign in

All three local demo accounts use the password **`LocalDemo123!`**. The sign-in page has buttons to fill these credentials.

| Role     | Email                        | Access                                                                      |
| -------- | ---------------------------- | --------------------------------------------------------------------------- |
| Admin    | `admin@subscriptiq.local`    | All operations, delete records, create team and customer accounts           |
| Staff    | `staff@subscriptiq.local`    | Dashboard, customers, catalog, subscriptions, billing and payment recording |
| Customer | `customer@subscriptiq.local` | Their own subscriptions, invoices and payment history                       |

The Docker app is bound to the local computer (`127.0.0.1:3000`). PostgreSQL is reachable only inside the Compose network. These sample accounts and fixed database credentials are for local evaluation.

### Everyday commands

```sh
# Check readiness and logs
docker compose ps
docker compose logs --tail=100 app db
curl http://localhost:3000/api/health

# Stop; keep all database records
docker compose down

# Restart after pulling code; migrations run automatically
git pull --ff-only
docker compose up --build -d --wait
```

`/api/health` returns `{"status":"ok","database":"ready"}` when the server and database are available. A normal restart keeps accounts, sessions and billing records in the `postgres_data` named volume.

To **delete all local records** and restore a fresh demo:

```sh
docker compose down --volumes
docker compose up --build -d --wait
```

To back up and restore the local database:

```sh
# Backup before changing or resetting data
docker compose exec -T db pg_dump -U subscriptiq -d subscriptiq -Fc > subscriptiq.dump

# Restore a backup into the existing local database
docker compose stop app
docker compose exec -T db pg_restore -U subscriptiq -d subscriptiq --clean --if-exists < subscriptiq.dump
docker compose up -d --wait
```

## Try the features

1. Sign in as admin and explore the populated dashboard.
2. Create/edit products and variants, billing plans, discounts and customer accounts.
3. Create a subscription with line items; set its status to **Active** and click **Run billing** on the subscription list.
4. Open an invoice, print it, and record an offline payment. The balance and invoice status update automatically.
5. Create an admin/staff account in **Team & Roles**. On **Customers**, use **Enable portal** to create a password for an unlinked customer's local account.
6. Sign out and use the customer account to view only its own billing history. Staff and customer permissions are also enforced by the API and PostgreSQL.

[Watch the project demo](https://drive.google.com/file/d/1YORVE_Ce8KEgYlrShs8OvlYLizQ3uG8L/view?usp=share_link) (recorded before the local-stack conversion; the current setup is described above).

## Develop without the app container

Use Node.js **22.13+** and npm. Docker can run just PostgreSQL while Vite and the API run on your computer:

```sh
npm ci
docker compose -f compose.yaml -f compose.dev.yaml up -d --wait db
npm run dev
```

Open **http://localhost:3000**. Vite serves the frontend on 3000 and proxies `/api` to the local Node server on 3001. The API automatically migrates and seeds the database. Stop the app container first if it is already using port 3000: `docker compose stop app`.

An `.env` file is optional. Copy `.env.example` if you need to override `DATABASE_URL`, skip demo initialization (`SEED_DEMO=false` on a fresh database), or set secure cookies when serving through HTTPS. Keep `PORT` unset for development so the API uses 3001. The default database URL matches the development Compose override; it publishes PostgreSQL only at `127.0.0.1:5432`.

To use an existing local PostgreSQL installation, create an empty `subscriptiq` database and set `DATABASE_URL`. The database login needs permission to create schemas and the `app_user` role. A previous hosted installation is not migrated in place: use a fresh local database and retain any existing database/backups separately. The migration runner rejects an unrecognized existing schema instead of overwriting it.

For a native production build:

```sh
npm run build
npm start
```

The Node server serves both the built app and API at **http://localhost:3000**, including direct links to nested pages. `npm run db:migrate` runs database initialization without starting the server.

## Verification

```sh
npm run check:deps
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

Run database and API integration tests against the local development database server:

```sh
TEST_DATABASE_URL=postgres://subscriptiq:subscriptiq@127.0.0.1:5432/postgres npm run test:db
TEST_DATABASE_URL=postgres://subscriptiq:subscriptiq@127.0.0.1:5432/postgres npm run test:api
```

These tests create and drop their own uniquely named databases. They verify migrations, transactional saves, row permissions, billing concurrency, cookie sessions, account provisioning, API validation, process restarts and production static serving. The server login must have `CREATEDB` and role-creation permissions. Build the frontend before `test:api`.

Alternatively, test using only the running Docker stack:

```sh
docker compose exec -e TEST_DATABASE_URL=postgres://subscriptiq:subscriptiq@db:5432/postgres app npm run test:db
docker compose exec -e TEST_DATABASE_URL=postgres://subscriptiq:subscriptiq@db:5432/postgres app npm run test:api
```

CI runs the frontend/browser-demo, database and API checks, verifies the generated Pages site, then builds and starts the complete Docker stack and checks port 3000.

## How the local stack works

- **Frontend:** React, TypeScript, Vite, TanStack Router/Query and Tailwind CSS. Fonts are bundled; the app makes no external service requests.
- **API:** Node.js HTTP server with validated, allowlisted queries and parameterized SQL. No database password is shipped to the browser.
- **Authentication:** scrypt password hashes and random, database-backed sessions in `HttpOnly`, `SameSite=Lax` cookies. Raw session tokens are never stored in the database or browser storage. The API validates same-origin JSON mutations.
- **Permissions:** ordinary data queries run as the restricted `app_user` PostgreSQL role with a transaction-local user ID. Row-level security isolates customer records; internal cost prices and team provisioning require staff/admin privileges.
- **Persistence:** PostgreSQL 17 in a named Docker volume. Migrations in `database/migrations` run once, check their checksums, and preserve data on restart. Add a new migration instead of editing an applied one.

## Billing behavior

**Run billing** generates all missing due periods for active subscriptions through the expiry date. Month-end and leap-year boundaries stay anchored to the original start date. Repeat runs do not duplicate invoices. Overlapping legacy invoice periods produce a reconciliation error. Backfilled invoices use their period start as the issue date and may already be overdue.

Payments are **offline ledger entries** recorded by staff; the app does not charge cards or contact payment providers. Product/variant and subscription/line edits are transactional. Concurrent billing and payments cannot consume a discount twice or overpay an invoice.

## Troubleshooting

- **Cannot connect to the Docker daemon:** start Docker Desktop/Engine, then rerun the Compose command.
- **Port 3000 already allocated:** stop the previous SubscriptIQ app or other process using that port, then restart. The standard setup always uses 3000.
- **Database or app unhealthy:** inspect `docker compose logs --tail=100 app db`; check free disk space. Do not remove the database volume unless you intend to reset its data.
- **Native development cannot connect to PostgreSQL:** start `db` with both Compose files and check `DATABASE_URL`; the default Compose file keeps the database private.
- **Old demo video or hosted deployment:** this repository now uses a local Node/PostgreSQL stack. Follow this guide instead of the old hosted-service setup.

## Dependency maintenance

Keep `@tanstack/react-router` and `@tanstack/router-plugin` aligned and regenerate `package-lock.json` and `bun.lock` after dependency updates. `npm run check:deps` rejects a second router copy. CI uses npm with peer checks enabled.

The TypeScript toolchain uses 6.0.x; the current `typescript-eslint` parser requires TypeScript `<6.1.0`. Dependabot groups the compiler/parser and router updates and holds unsupported compiler releases until parser support is reviewed.

The repository remains connected to Lovable. Preserve published Git history as described in [AGENTS.md](AGENTS.md). The Docker/Node setup in this guide is the supported way to run the full local application.
