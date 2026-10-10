# Campus Table — campus canteen ordering

A full-stack ordering and management system for a college canteen. Students browse the menu, pay online and
collect their food when it's ready; canteen staff run a live order queue from a separate, protected admin panel.

> **“Campus Table” is a placeholder name.** Rename it in `src/config/brand.ts` and in Admin → Settings. Nothing in
> this project claims affiliation with any real institution.

## Features

**Students**

- Menu from the database: search, category and vegetarian filters, sold-out states, per-item customisation and
  special instructions
- Cart that survives reloads (validated on load), then a checkout that shows the **server-calculated total** before
  payment and asks only for a pickup name (plus an ID if the college requires it)
- Razorpay payment; the order reaches the kitchen **only after server-side verification**
- Digital receipt with a unique order number (`CT-YYYYMMDD-NNNN`), live status tracking, a QR code with only the
  order number, print / save-as-PDF, and a private receipt link that works on any device
- My Orders, About/FAQ and ordering terms; responsive and mobile-first

**Staff and administrators (`/admin`)**

- Email/password sign-in, roles checked in the database (`admin`, `staff`); no public registration
- Dashboard: orders today, queue counts, completed today, revenue from verified payments minus refunds, activity
- **Live queue** (New → Preparing → Ready → Completed) with Realtime updates, reconnection, polling reconciliation,
  new-order highlight, optional sound and browser notifications
- Order history with search and filters; order detail with payment reference, refunds and a full audit trail
- Admin-only cancellation with automatic Razorpay refund; staff can mark items sold out and pause ordering
- Menu management (items, prices, photos, options, categories and their order) and canteen settings

## Tech stack

React 19 · Vite 7 · TypeScript (strict) · Tailwind CSS 4 · shadcn-style components on Radix · Lucide · Motion ·
TanStack Query · React Hook Form + Zod · React Router 7 · Supabase (Postgres, Auth, Realtime, Storage, Edge
Functions) · Razorpay · Vitest · Playwright · Vercel.

## Quick start

```bash
npm install
cp .env.example .env.local        # add your Supabase URL and anon/publishable key
npm run dev                       # http://localhost:5173
```

Without Supabase configured, the site still runs and shows a clear “not connected” state instead of pretending to
work. Full instructions — database, auth, admin accounts, Edge Functions and deployment — are in
**[docs/SETUP.md](docs/SETUP.md)**.

## Scripts

| Command                   | What it does                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`             | Start the Vite dev server                                                         |
| `npm run build`           | Typecheck and build for production (`dist/`)                                      |
| `npm run lint`            | ESLint (zero warnings allowed)                                                    |
| `npm run typecheck`       | TypeScript for the app, tests and Edge Function sources                           |
| `npm test`                | Unit and component tests (Vitest)                                                 |
| `npm run test:db`         | Migrations, RLS, SQL functions and Edge Function handlers against real PostgreSQL |
| `npm run test:e2e`        | Playwright student and admin flows (mocked backend — never real payments)         |
| `npm run check:functions` | Type-check every Edge Function with Deno                                          |
| `npm run admin:provision` | Create a staff/admin account (trusted machines only — see SETUP)                  |

`npm run test:db` starts a throwaway PostgreSQL automatically when `DATABASE_URL` is not set (needs the PostgreSQL
server binaries installed), or uses `DATABASE_URL` (e.g. in CI).

## Project structure

```
src/
  app/            router, providers, student and admin layouts
  components/     ui/ (design system) · layout/ · menu/ · cart/ · checkout/ · receipt/ · admin/ · home/ · common/
  pages/          student pages and pages/admin/*
  hooks/          data hooks (TanStack Query), admin hooks
  lib/            supabase/ (clients, types) · payments/ · validation/ · cart/ · money, dates, order status, errors
  services/       data access (student) and services/admin/*
  types/          domain types
supabase/
  migrations/     schema, RLS, SQL functions, Realtime and Storage
  seed.sql        clearly-labelled sample menu (ids start with 5eed0000-)
  functions/      create-payment-order · verify-payment · razorpay-webhook · update-order-status · _shared/
  tests/          integration tests + a Supabase compatibility shim for plain PostgreSQL
tests/e2e/        Playwright specs and the in-browser mock backend
docs/             setup, security, architecture, troubleshooting
```

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — Supabase, admin accounts, Edge Functions, local development, Vercel, go-live checklist
- [docs/SECURITY.md](docs/SECURITY.md) — every security-sensitive design decision
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data model, order lifecycle, payment flow, Realtime
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
