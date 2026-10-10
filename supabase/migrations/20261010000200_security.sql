-- =============================================================================
-- Campus Table — authorization: role helpers, Row Level Security and grants
--
-- Model
--   anon           : may read the public menu and settings only.
--   authenticated  : every signed-in user. Students are *anonymous* Supabase
--                    users (no personal data); they may read only their own
--                    orders. Staff/admin access is granted exclusively through
--                    rows in public.user_roles, which no API caller can write.
--   service_role   : Edge Functions only (never shipped to browsers). Creates
--                    orders and records verified payments through SECURITY
--                    DEFINER functions that validate every input.
--
-- Defence in depth: table privileges are revoked first and then granted back
-- minimally, so a missing policy fails closed rather than open.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so they can read user_roles regardless of the
-- caller's RLS; they only ever answer questions about the *calling* user.
-- Anonymous (guest) sessions can never hold a staff role.
-- -----------------------------------------------------------------------------
create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (
       select 1 from public.user_roles ur
       where ur.user_id = auth.uid() and ur.role = p_role
     );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin');
$$;

create or replace function public.has_staff_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin') or public.has_role('staff');
$$;

-- For the admin UI: which role does the current session hold?
create or replace function public.get_my_staff_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.has_role('admin') then 'admin'::public.app_role
    when public.has_role('staff') then 'staff'::public.app_role
    else null
  end;
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_item_options enable row level security;
alter table public.canteen_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_access_tokens enable row level security;
alter table public.order_number_counters enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.rate_limits enable row level security;
alter table public.audit_log enable row level security;

-- -----------------------------------------------------------------------------
-- Privileges: start from nothing for API roles, then grant the minimum.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.categories, public.menu_items, public.menu_item_options, public.canteen_settings
  to anon, authenticated;

grant insert, update, delete on public.categories, public.menu_items, public.menu_item_options
  to authenticated;                         -- restricted to admins by RLS below
grant update on public.canteen_settings to authenticated; -- restricted to admins by RLS below

grant select on public.profiles, public.user_roles, public.orders, public.order_items,
  public.payments, public.refunds, public.order_status_history,
  public.payment_webhook_events, public.audit_log
  to authenticated;                         -- rows filtered by RLS below

grant update (display_name) on public.profiles to authenticated;

-- order_access_tokens, order_number_counters and rate_limits: no API access at all.

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------

-- profiles
create policy "profiles: read own or staff"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_staff_access()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_roles: readable by the user it describes and by admins. No write
-- policies exist, so roles can only be assigned through trusted SQL.
create policy "user_roles: read own or admin"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- categories
create policy "categories: public reads active"
  on public.categories for select to anon, authenticated
  using (is_active or (select public.has_staff_access()));

create policy "categories: admin insert"
  on public.categories for insert to authenticated
  with check ((select public.is_admin()));

create policy "categories: admin update"
  on public.categories for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "categories: admin delete"
  on public.categories for delete to authenticated
  using ((select public.is_admin()));

-- menu_items: listed items in active categories are public (sold-out items are
-- listed so students can see availability; they cannot be ordered).
create policy "menu_items: public reads listed"
  on public.menu_items for select to anon, authenticated
  using (
    (
      is_active
      and exists (
        select 1 from public.categories c
        where c.id = menu_items.category_id and c.is_active
      )
    )
    or (select public.has_staff_access())
  );

create policy "menu_items: admin insert"
  on public.menu_items for insert to authenticated
  with check ((select public.is_admin()));

create policy "menu_items: admin update"
  on public.menu_items for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "menu_items: admin delete"
  on public.menu_items for delete to authenticated
  using ((select public.is_admin()));

-- menu_item_options
create policy "menu_item_options: public reads for listed items"
  on public.menu_item_options for select to anon, authenticated
  using (
    exists (
      select 1
      from public.menu_items mi
      join public.categories c on c.id = mi.category_id
      where mi.id = menu_item_options.menu_item_id and mi.is_active and c.is_active
    )
    or (select public.has_staff_access())
  );

create policy "menu_item_options: admin insert"
  on public.menu_item_options for insert to authenticated
  with check ((select public.is_admin()));

create policy "menu_item_options: admin update"
  on public.menu_item_options for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "menu_item_options: admin delete"
  on public.menu_item_options for delete to authenticated
  using ((select public.is_admin()));

-- canteen_settings: contains no secrets; public read, admin update.
create policy "canteen_settings: public read"
  on public.canteen_settings for select to anon, authenticated
  using (true);

create policy "canteen_settings: admin update"
  on public.canteen_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- orders: owners read their own; staff read all. There are deliberately no
-- INSERT/UPDATE/DELETE policies: orders change only through validated
-- SECURITY DEFINER functions (see the ordering, payment and staff migrations).
create policy "orders: owner or staff read"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_staff_access()));

create policy "order_items: owner or staff read"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = (select auth.uid())
    )
    or (select public.has_staff_access())
  );

-- Payment, refund and history details are exposed to students only through
-- get_order_receipt(), which returns a curated subset.
create policy "payments: staff read"
  on public.payments for select to authenticated
  using ((select public.has_staff_access()));

create policy "refunds: staff read"
  on public.refunds for select to authenticated
  using ((select public.has_staff_access()));

create policy "order_status_history: staff read"
  on public.order_status_history for select to authenticated
  using ((select public.has_staff_access()));

create policy "payment_webhook_events: admin read"
  on public.payment_webhook_events for select to authenticated
  using ((select public.is_admin()));

create policy "audit_log: admin read"
  on public.audit_log for select to authenticated
  using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- Function privileges. Postgres grants EXECUTE to PUBLIC by default and
-- Supabase additionally grants it to anon/authenticated; revoke everything and
-- grant back explicitly. Later migrations follow the same pattern.
-- -----------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.has_role(public.app_role) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_staff_access() to anon, authenticated;
grant execute on function public.get_my_staff_role() to authenticated;
grant execute on function public.try_parse_uuid(text) to anon, authenticated, service_role;
grant execute on function public.is_valid_opening_hours(jsonb) to anon, authenticated, service_role;
grant execute on function public.is_valid_order_transition(public.order_status, public.order_status)
  to anon, authenticated, service_role;
grant execute on function public.is_valid_staff_transition(public.order_status, public.order_status)
  to anon, authenticated, service_role;
