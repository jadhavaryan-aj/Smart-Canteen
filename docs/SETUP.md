# Setup and deployment

This guide takes you from an empty Supabase project to a deployed site. Steps marked **(dashboard)** have to be done
by a person in the Supabase or Vercel dashboards.

## 1. Prerequisites

- Node.js 20.19+ (22 recommended) and npm
- A Supabase project (free tier is fine)
- Optional: the [Supabase CLI](https://supabase.com/docs/guides/cli) (`npx supabase …`) for migrations and functions
- Optional: PostgreSQL 15+ server binaries, to run `npm run test:db` locally

## 2. Database

Apply the migrations in `supabase/migrations/` in filename order, then (optionally) the sample menu:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push              # applies supabase/migrations/*
```

Then load the sample menu once, if you want it: paste `supabase/seed.sql` into **SQL Editor → New query (dashboard)**
and run it. Every sample row has an id starting with `5eed0000-`; the header of `seed.sql` shows how to remove them.

Without the CLI you can paste each migration file into the SQL Editor in order instead.

The migrations create the tables, Row Level Security policies, database functions, the `orders` Realtime
publication entry, and a public `menu-images` Storage bucket (2 MB, JPEG/PNG/WebP, admin-only writes).

## 3. Authentication (dashboard)

In **Authentication → Sign In / Providers**:

1. **Enable anonymous sign-ins.** Students order as anonymous users — no email or phone is collected. Without this,
   checkout shows “Guest checkout is not enabled yet”.
2. Keep the **Email** provider enabled (staff sign in with email and password).
3. Turn **off** “Allow new users to sign up” for the Email provider if your plan allows it while keeping anonymous
   sign-ins working. Either way, signing up grants no access: staff rights come only from `user_roles`.

In **Authentication → Rate Limits**, raise the limit for anonymous sign-ins (default 30 per hour per IP). On campus
Wi-Fi many students share one public IP; 300 is a reasonable starting point.

Recommended: enable CAPTCHA protection (Turnstile or hCaptcha) for sign-ups in **Authentication → Attack Protection**
if you see abuse.

## 4. Admin and staff accounts

There is no public admin registration. Accounts and roles are provisioned through a trusted path — pick one:

**Script (recommended).** On your own machine, with the service-role key from **Project Settings → API**:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  npm run admin:provision -- --email chef@example.edu --role admin --name "Head Chef"
```

It creates the user (printing a one-time temporary password unless `ADMIN_PASSWORD` is set) and assigns the role. Use
`--role staff` for counter staff and `--revoke` to remove access. Never put the service-role key in a `VITE_`
variable, in Vercel, or in git.

**SQL.** Create the user in **Authentication → Users → Add user (dashboard)**, then in the SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'chef@example.edu';
```

| Role    | Can do                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| `staff` | View dashboard, queue and orders; move orders through the kitchen; mark items sold out; pause ordering        |
| `admin` | Everything staff can, plus cancel/refund orders, edit the menu and categories, upload photos, change settings |

## 5. Edge Functions

Deploy the four functions (their `verify_jwt` settings come from `supabase/config.toml`):

```bash
npx supabase functions deploy create-payment-order
npx supabase functions deploy verify-payment
npx supabase functions deploy razorpay-webhook
npx supabase functions deploy update-order-status
```

Set function secrets (copy `supabase/functions/.env.example` to `supabase/functions/.env`, fill it in, then):

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

| Secret                    | Purpose                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `ALLOWED_ORIGINS`         | Comma-separated site origins allowed to call the functions (e.g. `https://canteen.example`) |
| `RAZORPAY_KEY_ID`         | Razorpay key id (`rzp_test_…` or `rzp_live_…`)                                              |
| `RAZORPAY_KEY_SECRET`     | Razorpay key secret — server only                                                           |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for the `razorpay-webhook` function — server only                                    |
| `ALLOW_LIVE_PAYMENTS`     | Must be `true` before live keys are accepted                                                |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase automatically.

**Payments are not configured yet.** Until the Razorpay secrets are set, the checkout page states that online
payments aren't set up and no order can be paid. The menu, cart, admin panel and menu management all work in the
meantime. When you are ready to take payments, set the three Razorpay secrets above; the webhook endpoint is
`https://<ref>.supabase.co/functions/v1/razorpay-webhook`.

## 6. Realtime

The migration adds `public.orders` to the `supabase_realtime` publication. Check **Database → Publications
(dashboard)**: `supabase_realtime` should list only `orders`. Postgres Changes respects RLS, so students receive
events only for their own orders and staff for all orders.

## 7. Local development

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

To run everything locally with Docker instead of a hosted project:

```bash
npx supabase start            # local stack; applies migrations and seed.sql
npx supabase functions serve --env-file supabase/functions/.env
```

Use the local URL and anon key printed by `supabase start` in `.env.local`, then provision an admin with the script
(pointing `SUPABASE_URL` at `http://127.0.0.1:54321`).

## 8. Deploying the frontend to Vercel

1. Import the repository in Vercel (framework preset: Vite — `vercel.json` already sets build command, output
   directory, SPA rewrites and security headers).
2. Add environment variables **(dashboard)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Nothing else.
3. Deploy, then add the production origin to the `ALLOWED_ORIGINS` function secret and to **Authentication → URL
   Configuration → Site URL (dashboard)**.

If you serve Supabase from a custom domain, add it to `connect-src` and `img-src` in the Content-Security-Policy in
`vercel.json`.

## 9. Before going live — checklist

- [ ] Migrations applied; sample menu replaced with your real menu and photos
- [ ] Anonymous sign-ins enabled; anonymous rate limit raised; email sign-up disabled if possible
- [ ] At least one `admin` account provisioned; staff accounts created with the `staff` role
- [ ] Edge Functions deployed; `ALLOWED_ORIGINS` set to your production origin only
- [ ] Canteen name, opening hours, pickup instructions and student-ID mode set in Admin → Settings
- [ ] Placeholder ordering terms (`/terms`) and About copy reviewed by the canteen operator
- [ ] Payments configured (when ready) — live keys only with `ALLOW_LIVE_PAYMENTS=true`
- [ ] `npm run check` passes and the production build is deployed
