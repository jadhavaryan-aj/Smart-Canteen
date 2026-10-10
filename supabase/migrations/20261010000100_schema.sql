-- =============================================================================
-- Campus Table — core schema
--
-- Conventions
--   * All money is stored as integer paise (1 INR = 100 paise). Never floats.
--   * Every table exposed through the Supabase Data API has RLS enabled
--     (see 20261010000200_security.sql). Nothing here grants access.
--   * Order identity, amounts and payment state are protected by triggers and
--     CHECK constraints so that no code path — including service-role code —
--     can put an order into an inconsistent state.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'staff');

create type public.order_status as enum (
  'payment_pending', -- created, awaiting a verified payment; never shown in the kitchen queue
  'confirmed',       -- payment verified server-side; appears in the queue
  'accepted',        -- acknowledged by the kitchen
  'preparing',
  'ready',           -- ready for pickup
  'completed',       -- handed over
  'cancelled'
);

create type public.payment_status as enum (
  'pending', 'paid', 'failed', 'refund_pending', 'partially_refunded', 'refunded'
);

create type public.payment_record_status as enum (
  'created', 'captured', 'failed', 'partially_refunded', 'refunded'
);

create type public.refund_status as enum ('pending', 'processed', 'failed');

create type public.student_id_mode as enum ('hidden', 'optional', 'required');

create type public.status_change_source as enum ('system', 'payment', 'staff', 'admin');

-- -----------------------------------------------------------------------------
-- Utility functions
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Returns NULL instead of raising for malformed UUID text.
create or replace function public.try_parse_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null
     or p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return p_value::uuid;
end;
$$;

-- Opening hours: {"mon": {"open": "08:00", "close": "20:00", "closed": false}, ... "sun": {...}}
create or replace function public.is_valid_opening_hours(p_hours jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_day text;
  v_entry jsonb;
begin
  if p_hours is null or jsonb_typeof(p_hours) is distinct from 'object' then
    return false;
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_hours) as k(key)
    where k.key not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
  ) then
    return false;
  end if;
  foreach v_day in array array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] loop
    v_entry := p_hours -> v_day;
    if v_entry is null or jsonb_typeof(v_entry) is distinct from 'object' then
      return false;
    end if;
    if jsonb_typeof(v_entry -> 'closed') is distinct from 'boolean' then
      return false;
    end if;
    if coalesce(v_entry ->> 'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(v_entry ->> 'close', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;
    if not (v_entry ->> 'closed')::boolean
       and (v_entry ->> 'open')::time >= (v_entry ->> 'close')::time then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Identity: profiles and roles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is
  'One row per auth user (students are anonymous users with no personal data).';

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is
  'Staff/admin role assignments. Only writable by trusted SQL (service role / migrations). See docs/SETUP.md.';

-- -----------------------------------------------------------------------------
-- Menu
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  slug text not null unique
    check (char_length(slug) <= 48 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 160),
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_sort_idx on public.categories (sort_order, name);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 280),
  -- ₹1 .. ₹5,000 per item
  price_paise integer not null check (price_paise between 100 and 500000),
  image_url text check (
    image_url is null
    or (char_length(image_url) <= 1024 and image_url ~ '^(https://[^\s"''<>]+|/[A-Za-z0-9._~/-]+)$')
  ),
  is_vegetarian boolean not null default true,
  is_available boolean not null default true, -- false = sold out (still listed)
  is_active boolean not null default true,    -- false = hidden from the menu (archived)
  is_featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_category_idx on public.menu_items (category_id, sort_order, name);
create index menu_items_featured_idx on public.menu_items (is_featured) where is_featured;

create table public.menu_item_options (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  price_delta_paise integer not null default 0 check (price_delta_paise between 0 and 100000),
  is_available boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_item_id, name)
);
create index menu_item_options_item_idx on public.menu_item_options (menu_item_id, sort_order);

-- -----------------------------------------------------------------------------
-- Settings (single row)
-- -----------------------------------------------------------------------------
create table public.canteen_settings (
  id smallint primary key default 1 check (id = 1),
  canteen_name text not null default 'Campus Table' check (char_length(btrim(canteen_name)) between 2 and 60),
  tagline text check (tagline is null or char_length(tagline) <= 120),
  ordering_enabled boolean not null default true,
  ordering_paused boolean not null default false,
  pause_message text check (pause_message is null or char_length(pause_message) <= 200),
  enforce_opening_hours boolean not null default true,
  opening_hours jsonb not null default '{
    "mon": {"open": "08:00", "close": "20:00", "closed": false},
    "tue": {"open": "08:00", "close": "20:00", "closed": false},
    "wed": {"open": "08:00", "close": "20:00", "closed": false},
    "thu": {"open": "08:00", "close": "20:00", "closed": false},
    "fri": {"open": "08:00", "close": "20:00", "closed": false},
    "sat": {"open": "09:00", "close": "16:00", "closed": false},
    "sun": {"open": "09:00", "close": "14:00", "closed": true}
  }'::jsonb check (public.is_valid_opening_hours(opening_hours)),
  timezone text not null default 'Asia/Kolkata',
  pickup_instructions text check (pickup_instructions is null or char_length(pickup_instructions) <= 500),
  student_id_mode public.student_id_mode not null default 'hidden',
  student_id_label text not null default 'Student ID' check (char_length(btrim(student_id_label)) between 2 and 40),
  order_prefix text not null default 'CT' check (order_prefix ~ '^[A-Z]{1,6}$'),
  max_items_per_order integer not null default 30 check (max_items_per_order between 1 and 100),
  pending_payment_window_minutes integer not null default 30
    check (pending_payment_window_minutes between 5 and 240),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create or replace function public.canteen_settings_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'INVALID_TIMEZONE'
      using errcode = 'P0001', hint = 'Use an IANA time zone such as Asia/Kolkata.';
  end if;
  new.canteen_name := btrim(new.canteen_name);
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger canteen_settings_validate
  before insert or update on public.canteen_settings
  for each row execute function public.canteen_settings_validate();

insert into public.canteen_settings (id, pickup_instructions)
values (1, 'Show your order number at the pickup counter when your order is marked Ready.');

-- -----------------------------------------------------------------------------
-- Orders
-- -----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique check (order_number ~ '^[A-Z]{1,6}-[0-9]{8}-[0-9]{4,}$'),
  user_id uuid references auth.users (id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 40),
  student_identifier text check (student_identifier is null or char_length(student_identifier) <= 40),
  status public.order_status not null default 'payment_pending',
  payment_status public.payment_status not null default 'pending',
  subtotal_paise integer not null check (subtotal_paise >= 100),
  total_paise integer not null check (total_paise >= 100),
  currency text not null default 'INR' check (currency = 'INR'),
  item_count integer not null check (item_count between 1 and 100),
  idempotency_key uuid not null,
  request_fingerprint text not null,
  terms_accepted_at timestamptz not null,
  payment_expires_at timestamptz not null,
  paid_at timestamptz,
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_user_idempotency_key unique (user_id, idempotency_key),
  -- Prices are tax-inclusive; there are no fees, so total equals subtotal.
  constraint orders_total_matches_subtotal check (total_paise = subtotal_paise),
  -- An order can only be in a kitchen state if its payment has been verified.
  constraint orders_kitchen_states_require_payment check (
    status in ('payment_pending', 'cancelled')
    or payment_status in ('paid', 'refund_pending', 'partially_refunded', 'refunded')
  ),
  -- A pending order can never be marked paid.
  constraint orders_pending_is_unpaid check (
    status <> 'payment_pending' or payment_status in ('pending', 'failed')
  ),
  constraint orders_paid_requires_timestamp check (
    payment_status in ('pending', 'failed') or paid_at is not null
  )
);
comment on column public.orders.user_id is
  'Owner: the (usually anonymous) Supabase auth user that placed the order.';

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create index orders_paid_at_idx on public.orders (paid_at desc) where paid_at is not null;
create index orders_active_queue_idx on public.orders (status, paid_at)
  where status in ('confirmed', 'accepted', 'preparing', 'ready');
create index orders_status_idx on public.orders (status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  line_number smallint not null check (line_number between 1 and 100),
  menu_item_id uuid references public.menu_items (id) on delete set null,
  -- Snapshots: the receipt must not change when the menu changes.
  item_name text not null check (char_length(item_name) between 1 and 80),
  is_vegetarian boolean not null,
  base_price_paise integer not null check (base_price_paise >= 0),
  unit_price_paise integer not null check (unit_price_paise > 0),
  quantity integer not null check (quantity between 1 and 20),
  line_total_paise integer not null,
  customizations jsonb not null default '[]'::jsonb check (jsonb_typeof(customizations) = 'array'),
  special_instructions text check (special_instructions is null or char_length(special_instructions) <= 120),
  created_at timestamptz not null default now(),
  unique (order_id, line_number),
  constraint order_items_line_total check (line_total_paise = unit_price_paise * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_menu_item_idx on public.order_items (menu_item_id);

-- One Razorpay order per canteen order. Payment attempts that fail are
-- summarised on the row; the successful payment id is unique.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete restrict,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id text not null unique check (char_length(provider_order_id) between 1 and 64),
  provider_payment_id text unique check (provider_payment_id is null or char_length(provider_payment_id) between 1 and 64),
  amount_paise integer not null check (amount_paise >= 100),
  currency text not null default 'INR' check (currency = 'INR'),
  status public.payment_record_status not null default 'created',
  method text check (method is null or char_length(method) <= 32),
  verified_at timestamptz,
  verification_source text check (verification_source is null or verification_source in ('checkout', 'webhook')),
  amount_refunded_paise integer not null default 0,
  last_failed_payment_id text,
  failure_code text check (failure_code is null or char_length(failure_code) <= 100),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_refund_bounds check (amount_refunded_paise between 0 and amount_paise),
  constraint payments_success_has_reference check (
    status in ('created', 'failed') or (provider_payment_id is not null and verified_at is not null)
  )
);
comment on table public.payments is
  'Payment records. Only server-side code (service role) can write them, after verifying Razorpay signatures.';

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  provider_refund_id text unique check (provider_refund_id is null or char_length(provider_refund_id) <= 64),
  amount_paise integer not null check (amount_paise > 0),
  status public.refund_status not null default 'pending',
  reason text check (reason is null or char_length(reason) <= 300),
  initiated_by uuid references auth.users (id) on delete set null,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 300),
  attempt_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_order_idx on public.refunds (order_id);
create index refunds_processed_idx on public.refunds (processed_at) where status = 'processed';

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  previous_status public.order_status,
  new_status public.order_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  source public.status_change_source not null default 'system',
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);
create index order_status_history_created_idx on public.order_status_history (created_at desc);

-- Receipt links for guests: only a SHA-256 hash of a 256-bit random token is stored.
create table public.order_access_tokens (
  order_id uuid primary key references public.orders (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

-- Daily order-number counters (CT-YYYYMMDD-NNNN). Uniqueness is additionally
-- guaranteed by the unique constraint on orders.order_number.
create table public.order_number_counters (
  order_date date primary key,
  last_value integer not null check (last_value > 0)
);

-- -----------------------------------------------------------------------------
-- Payment provider webhooks (idempotency + audit). Payloads are minimised
-- before storage: no contact details, card data or VPA are kept.
-- -----------------------------------------------------------------------------
create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  event_id text not null check (char_length(event_id) between 1 and 128),
  event_type text not null check (char_length(event_type) <= 64),
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  processing_note text check (processing_note is null or char_length(processing_note) <= 500),
  attempts integer not null default 1,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
create index payment_webhook_events_received_idx on public.payment_webhook_events (received_at desc);

-- Fixed-window rate limiting for Edge Functions.
create table public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();
create trigger menu_item_options_updated_at before update on public.menu_item_options
  for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger refunds_updated_at before update on public.refunds
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Order lifecycle integrity
-- -----------------------------------------------------------------------------

-- The complete set of allowed status changes, for every caller.
create or replace function public.is_valid_order_transition(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'payment_pending' then p_to in ('confirmed', 'cancelled')
    when 'confirmed' then p_to in ('accepted', 'preparing', 'cancelled')
    when 'accepted' then p_to in ('preparing', 'cancelled')
    when 'preparing' then p_to in ('ready', 'cancelled')
    when 'ready' then p_to in ('preparing', 'completed', 'cancelled')
    else false
  end;
$$;

-- Kitchen staff can never confirm an order: only verified payments do that.
create or replace function public.is_valid_staff_transition(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_to <> 'confirmed' and public.is_valid_order_transition(p_from, p_to);
$$;

create or replace function public.orders_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.order_number <> old.order_number
     or (new.user_id is distinct from old.user_id and new.user_id is not null)
     or new.customer_name <> old.customer_name
     or new.student_identifier is distinct from old.student_identifier
     or new.subtotal_paise <> old.subtotal_paise
     or new.total_paise <> old.total_paise
     or new.currency <> old.currency
     or new.item_count <> old.item_count
     or new.idempotency_key <> old.idempotency_key
     or new.request_fingerprint <> old.request_fingerprint
     or new.created_at <> old.created_at then
    raise exception 'ORDER_IMMUTABLE_FIELD'
      using errcode = 'P0001', hint = 'Order identity and amounts cannot change after creation.';
  end if;

  if old.payment_status in ('paid', 'refund_pending', 'partially_refunded', 'refunded')
     and new.payment_status in ('pending', 'failed') then
    raise exception 'PAYMENT_STATUS_REGRESSION'
      using errcode = 'P0001', hint = 'A verified payment cannot be reverted to unpaid.';
  end if;

  if new.status is distinct from old.status then
    if not public.is_valid_order_transition(old.status, new.status) then
      raise exception 'INVALID_TRANSITION'
        using errcode = 'P0001',
              detail = format('%s -> %s', old.status, new.status),
              hint = 'This order status change is not allowed.';
    end if;

    if old.status = 'payment_pending' and new.status = 'confirmed' and new.payment_status <> 'paid' then
      raise exception 'PAYMENT_NOT_VERIFIED'
        using errcode = 'P0001', hint = 'Orders are confirmed only after a verified payment.';
    end if;

    case new.status
      when 'confirmed' then new.paid_at := coalesce(new.paid_at, now());
      when 'accepted' then new.accepted_at := now();
      when 'preparing' then new.preparing_at := coalesce(new.preparing_at, now());
      when 'ready' then new.ready_at := now();
      when 'completed' then new.completed_at := now();
      when 'cancelled' then new.cancelled_at := now();
      else null;
    end case;
  end if;

  return new;
end;
$$;

create trigger orders_guard before update on public.orders
  for each row execute function public.orders_guard();

-- Every status change is written to order_status_history, whatever the code path.
-- Callers describe the change via transaction-local settings:
--   app.status_source ('system' | 'payment' | 'staff' | 'admin') and app.status_note.
create or replace function public.orders_record_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.status_change_source :=
    coalesce(nullif(current_setting('app.status_source', true), ''), 'system')::public.status_change_source;
  v_note text := nullif(current_setting('app.status_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, previous_status, new_status, changed_by, source, note)
    values (new.id, null, new.status, auth.uid(), 'system', 'Order created');
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, previous_status, new_status, changed_by, source, note)
    values (new.id, old.status, new.status, auth.uid(), v_source, left(v_note, 300));
  end if;
  return null;
end;
$$;

create trigger orders_status_history
  after insert or update of status on public.orders
  for each row execute function public.orders_record_status_history();

-- -----------------------------------------------------------------------------
-- Audit trail for administrative tables
-- -----------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor_id, table_name, record_id, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.audit_row_change();
create trigger menu_items_audit after insert or update or delete on public.menu_items
  for each row execute function public.audit_row_change();
create trigger menu_item_options_audit after insert or update or delete on public.menu_item_options
  for each row execute function public.audit_row_change();
create trigger canteen_settings_audit after update on public.canteen_settings
  for each row execute function public.audit_row_change();
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();

-- -----------------------------------------------------------------------------
-- Profiles for new auth users
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that existed before this migration.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- History/refund actors are profiles so PostgREST can embed display names.
alter table public.order_status_history
  drop constraint order_status_history_changed_by_fkey,
  add constraint order_status_history_changed_by_fkey
    foreign key (changed_by) references public.profiles (id) on delete set null;
alter table public.refunds
  drop constraint refunds_initiated_by_fkey,
  add constraint refunds_initiated_by_fkey
    foreign key (initiated_by) references public.profiles (id) on delete set null;
