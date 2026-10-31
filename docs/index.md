---
layout: default
title: SubscriptIQ
---

# SubscriptIQ

Subscription management for Brightloop Software, with product catalogs, recurring plans, customer agreements, invoices, offline payment records and role-based access.

GitHub Pages hosts this project's documentation. The application uses TanStack Start and Supabase and requires a server runtime and database connection.

## Project guides

- [Setup, environment variables and account provisioning](https://github.com/tizkglame/SubscriptIQ/blob/main/README.md)
- [Audit findings and database migration requirements](https://github.com/tizkglame/SubscriptIQ/blob/main/AUDIT.md)
- [Source code](https://github.com/tizkglame/SubscriptIQ)
- [CI results](https://github.com/tizkglame/SubscriptIQ/actions/workflows/ci.yml)

## Run the application locally

Use Node.js 22.13 or later. Copy `.env.example` to `.env` and configure the browser and server Supabase connection values described in the setup guide.

```sh
git clone https://github.com/tizkglame/SubscriptIQ.git
cd SubscriptIQ
cp .env.example .env
npm ci
npm run dev
```

Apply database migrations through the database's existing migration mechanism before deploying the application. Existing databases must not replay the initial migration. The setup guide explains migration order and how to provision the first administrator and link customer accounts.

## Workspaces

| Role | Features |
| --- | --- |
| Admin | Billing operations, catalog and customer management, team provisioning |
| Staff | Subscriptions, invoices, payment records, catalog and customers |
| Customer | Linked account, subscription details and billing history |

Payment recording is an offline ledger workflow. The application does not charge cards or process payments.

## Verify a checkout

```sh
npm run check:deps
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

Database regression tests also run in CI. Local instructions and the isolated test database requirements are in the setup guide.
