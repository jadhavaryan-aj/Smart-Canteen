# Troubleshooting

### “Ordering isn’t connected yet”

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing or invalid in the build. Set them in `.env.local` (local)
or in Vercel's environment variables and redeploy — Vite embeds them at build time.

### “Guest checkout is not enabled yet”

Anonymous sign-ins are disabled. Enable them in **Authentication → Sign In / Providers**. If students on campus
Wi-Fi hit limits, raise **Authentication → Rate Limits → anonymous sign-ins**.

### “Online payments aren’t set up yet” / “The payment service is not deployed yet”

The `create-payment-order` function is not deployed, or the Razorpay secrets are not set (see
[SETUP.md §5](SETUP.md#5-edge-functions)). Live keys additionally require `ALLOW_LIVE_PAYMENTS=true`. Check
**Edge Functions → create-payment-order → Logs** for `payments_not_configured`.

### Requests to Edge Functions fail with CORS errors

Add your site's exact origin (scheme + host, no trailing slash) to the `ALLOWED_ORIGINS` secret, e.g.
`https://canteen.example,https://canteen-preview.vercel.app`, then redeploy or restart the functions.

### A student paid but the order still says “Payment pending”

The receipt page keeps checking automatically. Confirmation arrives either from `verify-payment` or the
`razorpay-webhook` function. Check that function's logs and the `payment_webhook_events` table (admins can read it).
Payments are never confirmed from the browser alone, by design.

### The payment window is blank or doesn't open

An ad blocker or the Content-Security-Policy may be blocking `checkout.razorpay.com`. If you changed `vercel.json`,
make sure Razorpay domains are still allowed in `script-src`, `frame-src` and `connect-src`.

### Staff can sign in but see “This account isn’t authorised”

The account has no row in `public.user_roles`. Provision it with `npm run admin:provision` or the SQL in
[SETUP.md §4](SETUP.md#4-admin-and-staff-accounts).

### The live queue shows “Reconnecting…”

The Realtime connection dropped; the queue still refreshes every 30 seconds and reconnects automatically. Check that
`orders` is in the `supabase_realtime` publication (**Database → Publications**) and that the network allows
WebSockets.

### Image upload fails

Run the migrations (they create the `menu-images` bucket) and use JPEG, PNG or WebP files up to 2 MB. Only admins
can upload. You can also paste an `https://` image URL.

### `npm run test:db` says PostgreSQL binaries were not found

Install PostgreSQL 15+ (server binaries) or point `DATABASE_URL` at any PostgreSQL 15+ server where your user can
create databases. The tests create and drop a throwaway database.

### Changing the schema

Add a new file in `supabase/migrations/` (never edit applied ones), run `npm run test:db`, then regenerate types with
`npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`.

### Cancelling an order fails with “The payment service is not deployed yet”

Kitchen progress (accept → preparing → ready → completed) talks to the database directly, but cancellations go
through the `update-order-status` Edge Function so a paid order's refund can be submitted with the server-side
secret. Deploy that function (see [SETUP.md §5](SETUP.md#5-edge-functions)).
