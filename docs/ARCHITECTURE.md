# Architecture

## Overview

```
Browser (React SPA on Vercel)
  ├─ Supabase JS (anon key + user JWT) ──► PostgREST ──► PostgreSQL (RLS, SQL functions)
  ├─ Supabase Realtime (orders changes, RLS-filtered)
  ├─ Edge Functions ──────────────────────► SQL functions (service role) + Razorpay API
  └─ Razorpay Checkout (public key id + server-created order id only)

Razorpay ──webhook──► razorpay-webhook Edge Function ──► SQL functions
```

All business rules live in PostgreSQL. Edge Functions exist only where a server-side secret is needed (creating
Razorpay orders, verifying payments, refunds) and share tested handler code with the integration tests
(`supabase/functions/*/handler.ts` + `_shared/`).

## Data model

| Table                    | Purpose                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `profiles`               | One row per auth user (display name for staff)                                                      |
| `user_roles`             | `admin` / `staff` assignments                                                                       |
| `categories`             | Menu categories with sort order and visibility                                                      |
| `menu_items`             | Items: price in paise, photo, veg flag, `is_available` (stock), `is_active` (listed), `is_featured` |
| `menu_item_options`      | Optional add-ons with a non-negative price delta                                                    |
| `canteen_settings`       | Single row: name, hours, pause, pickup instructions, ID mode, order prefix                          |
| `orders`                 | Order header, status, payment status, totals, lifecycle timestamps                                  |
| `order_items`            | Line snapshots: name, unit price, quantity, customisations, note                                    |
| `payments`               | One Razorpay order per canteen order; verified payment reference                                    |
| `refunds`                | Refund attempts and their Razorpay state                                                            |
| `order_status_history`   | Audit trail of every status change (actor, source, note)                                            |
| `order_access_tokens`    | SHA-256 hashes of receipt-link tokens                                                               |
| `order_number_counters`  | Atomic per-day counters for order numbers                                                           |
| `payment_webhook_events` | Webhook idempotency and minimised payloads                                                          |
| `rate_limits`            | Fixed-window counters for Edge Functions                                                            |
| `audit_log`              | Changes to menu, categories, settings and roles                                                     |

Money is always integer paise. Prices are tax-inclusive, so `total = subtotal` (enforced by a constraint).

## Order lifecycle

```
payment_pending ──(verified payment)──► confirmed ──► accepted ──► preparing ──► ready ──► completed
       │                                    │             │            │  ▲         │
       └──────────────► cancelled ◄─────────┴─────────────┴────────────┘  └─(undo)──┘
```

- `payment_pending` orders never appear in the kitchen queue. Only verified payments move an order to `confirmed`.
- Staff move orders forward; `ready → preparing` is allowed to undo a mistaken tap; `completed` is final.
- Only admins cancel (with a reason). Cancelling a paid order creates a refund.
- Unpaid orders expire for payment after `pending_payment_window_minutes` (default 30); a payment that still
  arrives later confirms the order (the student paid), or is flagged for refund if an admin cancelled it.

## Payment flow

1. **Quote** — the checkout page calls `quote_cart()` and shows the server-calculated total.
2. **Create** — `create-payment-order` authenticates the student, rate-limits, calls `create_pending_order()` (prices
   from the DB, idempotent per key), re-validates replays with `prepare_order_payment()`, creates a Razorpay order
   for the exact amount and links it with `attach_provider_order()`. It returns the public key id, the Razorpay
   order id and a one-time receipt token.
3. **Pay** — Razorpay Checkout opens in the browser.
4. **Verify** — `verify-payment` checks ownership, the HMAC signature and the payment via Razorpay's API (capturing
   authorised payments), then calls `confirm_order_payment()`.
5. **Webhook** — `razorpay-webhook` independently confirms `payment.captured` / `order.paid`, records failures and
   refunds. Both paths are idempotent; whichever arrives first confirms the order.
6. **Receipt** — the student lands on `/orders/:id`; if confirmation is delayed it shows “Confirming your payment…”
   and keeps checking.

## Realtime

- Only `public.orders` is published. Clients treat events as hints and re-fetch authoritative data.
- **Admin:** one channel for all order changes; on `SUBSCRIBED` it reconciles everything; on error/timeout it
  resubscribes with exponential backoff (1 s → 30 s); it also refetches on reconnect, on tab focus and every 30 s.
  New orders are detected by diffing fetched data, so none are missed after a disconnect. Notifications: toast,
  highlight, optional Web Audio chime and browser notifications (when the tab is hidden and permission granted).
- **Student:** the receipt page subscribes to its own order (`id=eq.…`, RLS-scoped) plus a polling fallback.

## Frontend structure

- `services/` call Supabase; `hooks/` wrap them in TanStack Query; pages compose components.
- The cart is a small external store (`useSyncExternalStore`) persisted to `localStorage` and synced across tabs;
  the pure reducer is unit tested.
- Admin pages and heavier student pages are code-split; the landing page does not load form or admin code.
- Motion respects `prefers-reduced-motion` (global `MotionConfig` plus CSS).

## Testing strategy

| Layer            | Tool                                       | Covers                                                                                     |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Unit / component | Vitest + Testing Library                   | Cart totals and quantities, money, transitions, validation, signatures, route guard        |
| Database         | Vitest + `pg` against PostgreSQL + shim    | RLS, grants, pricing, idempotency, order numbers, receipts, payments, refunds, staff rules |
| Edge Functions   | Handlers + real PostgreSQL + fake Razorpay | Signature/forgery, duplicate callbacks, webhooks, refunds, rate limits, CORS               |
| End-to-end       | Playwright + in-browser mock backend       | Student flow (desktop + mobile) and admin flow                                             |

The shim (`supabase/tests/shim/supabase-shim.sql`) recreates the parts of Supabase the migrations rely on (API
roles, `auth.uid()`/`auth.jwt()`, `auth.users`, Storage tables, the Realtime publication, default privileges) so
the real migrations run on plain PostgreSQL in CI.
