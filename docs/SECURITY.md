# Security design

This document records every security-sensitive decision. The guiding rule: **the browser is never trusted.** Hiding a
button or guarding a route is a convenience for people; protection is enforced by PostgreSQL (RLS, grants, SQL role
checks, constraints and triggers) and by Edge Functions holding server-only secrets.

## Identities and roles

| Who            | How they authenticate                               | What they can do                                    |
| -------------- | --------------------------------------------------- | --------------------------------------------------- |
| Visitor        | none (`anon` key)                                   | Read the public menu, settings and ordering status  |
| Student        | Supabase **anonymous** user (no personal data)      | Their own orders only                               |
| Staff / admin  | Email + password, plus a row in `public.user_roles` | Kitchen operations / full administration            |
| Edge Functions | Service-role key (server environment only)          | Create orders, record verified payments and refunds |

- Students are anonymous Supabase users. Every order is owned by a real `auth.users` row, so RLS can scope access
  (`orders.user_id = auth.uid()`) without collecting email, phone or passwords.
- Roles live in `public.user_roles`. It has **no INSERT/UPDATE/DELETE policies** and those privileges are revoked
  from API roles, so nobody can grant themselves a role through the API. Roles are assigned only by trusted SQL or
  the provisioning script (service role).
- `has_role()`/`is_admin()`/`has_staff_access()` are `SECURITY DEFINER` functions with `search_path = ''` that only
  answer about the calling user, and they **always return false for anonymous sessions** (`is_anonymous` claim),
  even if a role row were somehow created for one.
- Student and admin sessions use separate browser storage keys, so a staff member signing in on a shared tablet
  never inherits or overwrites a student's session.

## Row Level Security and grants

- RLS is enabled on **every** table in `public` (a test fails if any table is missing it).
- Privileges are revoked from `anon`/`authenticated` first and granted back minimally, so a forgotten policy fails
  closed. Supabase's default `EXECUTE` on functions is revoked too; a test asserts the exact list of functions
  callable by `anon`.
- Public reads: active categories, listed menu items (sold-out ones included, so availability is visible), their
  options, and canteen settings (which contain no secrets).
- `orders`/`order_items`: owner or staff can read; **no write policies at all**. Orders change only through
  validated `SECURITY DEFINER` functions.
- `payments`, `refunds`, `order_status_history`: staff only. Students get a curated view through
  `get_order_receipt()` (no staff ids, no raw provider data).
- `payment_webhook_events`, `audit_log`: admins only. `order_access_tokens`, `order_number_counters`,
  `rate_limits`: no API access.
- Storage: the `menu-images` bucket is public-read (menu photos only); upload/update/delete require `is_admin()`
  and an image extension; Storage enforces 2 MB and JPEG/PNG/WebP. No order or customer data is ever stored in a
  bucket.

## Prices and order creation

- The browser sends only menu item ids, quantities, option ids and notes. Request schemas are `strict`, so a
  request containing `price`, `total` or any unknown field is rejected outright.
- `price_cart()` computes every amount from the database in **integer paise** and rejects malformed input
  (non-integer or out-of-range quantities, bad ids, duplicate options, long or control-character notes, oversized
  carts). Sold-out, hidden or unknown items are refused at order creation.
- Order lines store a snapshot of name and unit price, so receipts never change when the menu does.
- Idempotency: each checkout carries an idempotency key; `(user_id, idempotency_key)` is unique. Repeated or
  concurrent submissions return the same order; reusing a key for a different cart is rejected.
- Order numbers come from an atomic per-day counter (`INSERT … ON CONFLICT DO UPDATE`) and are protected by a
  unique constraint; a concurrency test creates orders in parallel and checks uniqueness.
- Opening hours, pauses and the ordering master switch are enforced in SQL, not only in the UI.

## Payments

- The Razorpay **key secret and webhook secret exist only as Edge Function secrets.** The browser receives the
  public key id and a server-created Razorpay order id — nothing else.
- An order is confirmed only by `confirm_order_payment()` (service role only), and only after:
  - **checkout path:** HMAC-SHA256(`order_id|payment_id`) verified with the key secret using a constant-time
    comparison, the Razorpay order id matched to the order, and the payment **fetched from Razorpay's API** to check
    order id, amount, currency and `captured` status (authorised payments are captured server-side first); or
  - **webhook path:** HMAC-SHA256 of the raw body verified with the webhook secret.
- The frontend's “success” callback is treated as a claim. If our server cannot reach Razorpay, the order stays
  `payment_pending` and the webhook settles it later.
- Database invariants make forged states impossible even for buggy server code:
  - CHECK constraints: kitchen statuses require a verified payment; a pending order cannot be marked paid.
  - A trigger blocks changes to order identity and amounts after creation, enforces the state machine, blocks
    `payment_pending → confirmed` without a paid status, and forbids reverting a verified payment to unpaid.
- Idempotency: payment rows are locked (`FOR UPDATE`), the same payment id is a no-op, a _different_ captured
  payment for a paid order is flagged (`duplicate_payment`) and never double-confirms, amount mismatches never
  confirm. Webhook deliveries are deduplicated by Razorpay's event id (`payment_webhook_events`), and failed
  deliveries can be retried safely.
- Refunds: only admins can cancel a paid order; the database records a pending refund, and the Edge Function submits
  it to Razorpay with the server-side secret. Refund state is reconciled from Razorpay's API responses and
  `refund.*` webhooks; processed refunds are summed (never double counted).
- Live keys are refused unless `ALLOW_LIVE_PAYMENTS=true`, so a development deployment can never take real money by
  accident. Automated tests use an in-memory fake Razorpay and never make network calls.
- No card, UPI or bank details are stored. Webhook payloads are minimised before storage (contact details, emails,
  VPAs and card data are dropped).

## Staff operations

- Status changes run through `staff_update_order_status()`, which checks the caller's role from `user_roles`,
  validates the transition, requires an admin and a reason to cancel, and supports optimistic concurrency
  (`expected_status`) so two tablets cannot silently overwrite each other. Staff can never set `confirmed` or touch
  payment fields.
- Every status change — from any code path — is written to `order_status_history` by a trigger, with the actor and
  source. Menu, category, settings and role changes are recorded in `audit_log`. Completed orders are never
  deleted (orders have no delete privilege for API roles).
- Counter staff get two narrowly scoped functions: mark an item sold out/in stock, and pause/resume ordering.

## Receipts and order access (IDOR)

- `get_order_receipt()` authorises the owner, staff, or the holder of the order's **receipt token**. Unauthorised
  and non-existent orders both return `null`, so ids cannot be probed.
- Receipt tokens are 256-bit random values; only their SHA-256 hash is stored. The token travels in the URL
  **fragment** (`/orders/<id>#t=…`), which browsers never send to servers or in `Referer` headers, and it is removed
  from the address bar after being saved on the device.
- The QR code on the receipt contains only the order number.
- `verify-payment` returns 404 for orders the caller does not own.

## Edge Function hardening

- Callers are authenticated with `auth.getUser(jwt)` (works with legacy and asymmetric signing keys); `verify_jwt`
  is off so the webhook can authenticate by signature instead.
- Inputs are validated with strict Zod schemas; bodies are size-limited (16 KB, 256 KB for webhooks).
- Database-backed rate limits per user and per IP (`check_rate_limit`) protect order creation, verification and
  staff updates. Limits are generous per IP because campus Wi-Fi shares addresses.
- CORS is restricted to `ALLOWED_ORIGINS` in production.
- Errors returned to clients never include SQL, stack traces or secrets; unexpected errors become a generic
  message. Logs contain ids and codes only.
- Every `SECURITY DEFINER` function sets `search_path = ''` and fully qualifies objects (a test enforces this).

## Frontend

- Only `VITE_SUPABASE_URL` and the anon/publishable key are exposed to the browser; both are public by design.
- `vercel.json` sets CSP (scripts only from self and Razorpay), `X-Frame-Options: DENY`, `nosniff`, HSTS, a strict
  referrer policy and a restrictive Permissions-Policy. The admin panel adds `noindex`.
- The persisted cart is validated on load; tampered values are discarded (and prices in it are never used for
  payment anyway).
- The login page only redirects to `/admin` paths (no open redirects).

## Known limitations

- Staff passwords are managed by Supabase Auth; enable leaked-password protection and MFA in the dashboard for
  administrators if your plan supports it.
- Anonymous sessions live in the browser; a student who clears storage loses “My Orders” (the receipt link still
  works). This is the trade-off for collecting no personal data.
- A captured _duplicate_ payment (two successful payments for one order — rare) is flagged in logs and the
  webhook record but must be refunded from the Razorpay dashboard.
