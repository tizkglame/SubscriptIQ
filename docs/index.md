---
layout: default
title: SubscriptIQ
---

# SubscriptIQ

Subscription management for Brightloop Software. The app runs entirely on your computer using React, a Node.js API and PostgreSQL, with no cloud account or API keys.

## Run locally

Install Docker Desktop or Docker Engine with Compose v2, then:

```sh
git clone https://github.com/tizkglame/SubscriptIQ.git
cd SubscriptIQ
docker compose up --build -d --wait
```

Open **http://localhost:3000**. Sign in with `admin@subscriptiq.local`, `staff@subscriptiq.local`, or `customer@subscriptiq.local`. All three sample accounts use `LocalDemo123!`.

The database is initialized automatically and stored in a persistent Docker volume. The app is bound to the local computer; sample accounts are intended for local evaluation.

## Features

Admins manage team members and customer portal access. Admins and staff manage customers, products/variants, plans, discounts, subscriptions, invoices and offline payment records. Customers see only their own billing records.

**Run billing** creates due invoice periods idempotently. Payments are ledger entries; no cards are charged.

## Guides and source

- [Complete running guide, backups, development and tests](https://github.com/tizkglame/SubscriptIQ#readme)
- [Source code](https://github.com/tizkglame/SubscriptIQ)
- [Automated checks](https://github.com/tizkglame/SubscriptIQ/actions)
- [Audit history](https://github.com/tizkglame/SubscriptIQ/blob/main/AUDIT.md)

GitHub Pages serves this documentation. Run the full application with Docker on port 3000.
