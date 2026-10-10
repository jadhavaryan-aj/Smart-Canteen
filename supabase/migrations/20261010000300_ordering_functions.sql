-- =============================================================================
-- Campus Table — ordering: opening hours, server-side pricing, order creation
-- and receipt access.
--
-- Pricing is calculated *only* here, from the database. The browser sends menu
-- item ids, quantities, option ids and notes — never prices or totals.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Opening status
-- -----------------------------------------------------------------------------
create or replace function public.get_ordering_status(p_at timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.canteen_settings;
  v_days constant text[] := array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  v_local timestamp;
  v_time time;
  v_today jsonb;
  v_reason text;
  v_next jsonb;
  v_candidate_date date;
  v_candidate jsonb;
begin
  select * into s from public.canteen_settings where id = 1;
  if not found then
    return jsonb_build_object(
      'is_open', false, 'reason', 'disabled',
      'message', 'Online ordering has not been configured yet.',
      'today_hours', null, 'next_opening', null
    );
  end if;

  v_local := p_at at time zone s.timezone;
  v_time := v_local::time;
  v_today := s.opening_hours -> v_days[extract(isodow from v_local)::int];

  if not s.ordering_enabled then
    v_reason := 'disabled';
  elsif s.ordering_paused then
    v_reason := 'paused';
  elsif not s.enforce_opening_hours then
    v_reason := 'open';
  elsif (v_today ->> 'closed')::boolean then
    v_reason := 'closed_today';
  elsif v_time < (v_today ->> 'open')::time then
    v_reason := 'before_opening';
  elsif v_time >= (v_today ->> 'close')::time then
    v_reason := 'after_closing';
  else
    v_reason := 'open';
  end if;

  if v_reason in ('closed_today', 'before_opening', 'after_closing') then
    for i in 0..7 loop
      v_candidate_date := v_local::date + i;
      v_candidate := s.opening_hours -> v_days[extract(isodow from v_candidate_date)::int];
      if not (v_candidate ->> 'closed')::boolean
         and (i > 0 or v_time < (v_candidate ->> 'open')::time) then
        v_next := jsonb_build_object(
          'day', v_days[extract(isodow from v_candidate_date)::int],
          'date', v_candidate_date,
          'time', v_candidate ->> 'open'
        );
        exit;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'is_open', v_reason = 'open',
    'reason', v_reason,
    'message', case v_reason
      when 'paused' then coalesce(nullif(btrim(s.pause_message), ''), 'Online ordering is paused for a short while.')
      when 'disabled' then 'Online ordering is currently turned off.'
      when 'closed_today' then 'The canteen is closed today.'
      when 'before_opening' then 'The canteen has not opened yet.'
      when 'after_closing' then 'The canteen has closed for the day.'
      else null
    end,
    'today_hours', v_today,
    'next_opening', v_next
  );
end;
$$;

create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'canteen_name', s.canteen_name,
    'tagline', s.tagline,
    'pickup_instructions', s.pickup_instructions,
    'opening_hours', s.opening_hours,
    'timezone', s.timezone,
    'student_id_mode', s.student_id_mode,
    'student_id_label', s.student_id_label,
    'max_items_per_order', s.max_items_per_order,
    'ordering_status', public.get_ordering_status()
  )
  from public.canteen_settings s
  where s.id = 1;
$$;

-- -----------------------------------------------------------------------------
-- Pricing
--
-- Input:  [{ "menu_item_id": uuid, "quantity": 1..20, "option_ids": [uuid], "note": text }]
-- Output: { lines: [...], subtotal_paise, total_paise, item_count, issues: [...] }
--
-- Structural problems raise INVALID_CART / INVALID_QUANTITY / EMPTY_CART.
-- Availability problems are returned as issues, or raise ITEMS_UNAVAILABLE
-- when p_strict is true. SECURITY INVOKER: callers only ever see menu rows
-- their RLS policies allow (anon cannot price hidden items).
-- -----------------------------------------------------------------------------
create or replace function public.price_cart(p_items jsonb, p_strict boolean default false)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  c_max_lines constant integer := 30;
  c_max_quantity constant integer := 20;
  c_max_options constant integer := 10;
  c_max_total constant bigint := 10000000; -- ₹1,00,000 per order
  v_elem jsonb;
  v_index integer := -1;
  v_item_id uuid;
  v_quantity integer;
  v_note text;
  v_option_ids uuid[];
  v_item record;
  v_item_found boolean;
  v_options jsonb;
  v_options_total bigint;
  v_option_count integer;
  v_unit bigint;
  v_line_total bigint;
  v_issue text;
  v_lines jsonb := '[]'::jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_item_count integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'INVALID_CART' using errcode = 'P0001', hint = 'The cart must be a list of items.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001', hint = 'Add at least one item to your order.';
  end if;
  if jsonb_array_length(p_items) > c_max_lines then
    raise exception 'INVALID_CART' using errcode = 'P0001', hint = 'Too many different items in one order.';
  end if;

  for v_elem in select value from jsonb_array_elements(p_items) loop
    v_index := v_index + 1;

    if jsonb_typeof(v_elem) is distinct from 'object' then
      raise exception 'INVALID_CART' using errcode = 'P0001', hint = 'Each cart line must be an object.';
    end if;

    v_item_id := public.try_parse_uuid(v_elem ->> 'menu_item_id');
    if v_item_id is null then
      raise exception 'INVALID_CART' using errcode = 'P0001', hint = 'A cart line has an invalid menu item.';
    end if;

    if jsonb_typeof(v_elem -> 'quantity') is distinct from 'number'
       or (v_elem ->> 'quantity') !~ '^[0-9]{1,3}$' then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001', hint = 'Quantities must be whole numbers.';
    end if;
    v_quantity := (v_elem ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > c_max_quantity then
      raise exception 'INVALID_QUANTITY'
        using errcode = 'P0001', hint = format('Quantities must be between 1 and %s.', c_max_quantity);
    end if;

    if v_elem ? 'note' and jsonb_typeof(v_elem -> 'note') not in ('string', 'null') then
      raise exception 'INVALID_CART' using errcode = 'P0001', hint = 'Notes must be text.';
    end if;
    v_note := nullif(btrim(regexp_replace(coalesce(v_elem ->> 'note', ''), '\s+', ' ', 'g')), '');
    if v_note is not null and (char_length(v_note) > 120 or v_note ~ '[\x00-\x1F\x7F<>]') then
      raise exception 'INVALID_CART'
        using errcode = 'P0001', hint = 'Notes must be at most 120 characters of plain text.';
    end if;

    v_option_ids := '{}';
    if v_elem ? 'option_ids' and jsonb_typeof(v_elem -> 'option_ids') is distinct from 'null' then
      if jsonb_typeof(v_elem -> 'option_ids') is distinct from 'array'
         or jsonb_array_length(v_elem -> 'option_ids') > c_max_options then
        raise exception 'INVALID_CART' using errcode = 'P0001', hint = 'Invalid item options.';
      end if;
      select coalesce(array_agg(public.try_parse_uuid(x.value)), '{}')
        into v_option_ids
        from jsonb_array_elements_text(v_elem -> 'option_ids') as x(value);
      if array_position(v_option_ids, null) is not null
         or (select count(distinct o) from unnest(v_option_ids) as o) <> cardinality(v_option_ids) then
        raise exception 'INVALID_CART' using errcode = 'P0001', hint = 'Invalid item options.';
      end if;
    end if;

    select mi.id, mi.name, mi.price_paise, mi.is_vegetarian, mi.is_available,
           (mi.is_active and c.is_active) as is_listed
      into v_item
      from public.menu_items mi
      join public.categories c on c.id = mi.category_id
     where mi.id = v_item_id;
    v_item_found := found;

    v_issue := null;
    v_options := '[]'::jsonb;
    v_options_total := 0;

    if not v_item_found or not v_item.is_listed then
      v_issue := 'not_found';
    elsif not v_item.is_available then
      v_issue := 'sold_out';
    elsif cardinality(v_option_ids) > 0 then
      select coalesce(jsonb_agg(jsonb_build_object(
                'id', o.id, 'name', o.name, 'price_delta_paise', o.price_delta_paise
              ) order by o.sort_order, o.name), '[]'::jsonb),
             coalesce(sum(o.price_delta_paise), 0),
             count(*)
        into v_options, v_options_total, v_option_count
        from public.menu_item_options o
       where o.menu_item_id = v_item_id
         and o.id = any (v_option_ids)
         and o.is_available;
      if v_option_count <> cardinality(v_option_ids) then
        v_issue := 'option_unavailable';
      end if;
    end if;

    if v_issue is not null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'menu_item_id', v_item_id,
        'code', v_issue,
        'name', case when v_item_found and v_item.is_listed then v_item.name end
      ));
      continue;
    end if;

    v_unit := v_item.price_paise + v_options_total;
    v_line_total := v_unit * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
    v_item_count := v_item_count + v_quantity;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'menu_item_id', v_item_id,
      'name', v_item.name,
      'is_vegetarian', v_item.is_vegetarian,
      'base_price_paise', v_item.price_paise,
      'unit_price_paise', v_unit,
      'quantity', v_quantity,
      'line_total_paise', v_line_total,
      'options', v_options,
      'note', v_note
    ));
  end loop;

  if v_subtotal > c_max_total then
    raise exception 'ORDER_TOO_LARGE' using errcode = 'P0001', hint = 'This order exceeds the maximum order value.';
  end if;

  if p_strict and jsonb_array_length(v_issues) > 0 then
    raise exception 'ITEMS_UNAVAILABLE'
      using errcode = 'P0001',
            detail = v_issues::text,
            hint = 'Some items in your cart are no longer available.';
  end if;

  return jsonb_build_object(
    'lines', v_lines,
    'subtotal_paise', v_subtotal,
    'total_paise', v_subtotal,
    'item_count', v_item_count,
    'issues', v_issues
  );
end;
$$;

-- Public, side-effect-free quote used by the checkout page to display the
-- server-calculated total before payment.
create or replace function public.quote_cart(p_items jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return public.price_cart(p_items, false)
    || jsonb_build_object('ordering_status', public.get_ordering_status());
end;
$$;

-- -----------------------------------------------------------------------------
-- Order numbers: PREFIX-YYYYMMDD-NNNN using an atomic per-day counter.
-- The ON CONFLICT upsert takes a row lock, so concurrent callers are
-- serialised and can never receive the same number.
-- -----------------------------------------------------------------------------
create or replace function public.next_order_number()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.canteen_settings;
  v_day date;
  v_value integer;
begin
  select * into s from public.canteen_settings where id = 1;
  v_day := (now() at time zone coalesce(s.timezone, 'Asia/Kolkata'))::date;

  insert into public.order_number_counters as c (order_date, last_value)
  values (v_day, 1)
  on conflict (order_date) do update set last_value = c.last_value + 1
  returning c.last_value into v_value;

  return coalesce(s.order_prefix, 'CT') || '-' || to_char(v_day, 'YYYYMMDD') || '-' || lpad(v_value::text, 4, '0');
end;
$$;

-- Deterministic fingerprint of a checkout request, used to detect an
-- idempotency key being reused for a *different* cart.
create or replace function public.checkout_fingerprint(p_items jsonb, p_customer_name text, p_student_identifier text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'm', lower(e.value ->> 'menu_item_id'),
        'q', e.value -> 'quantity',
        'o', coalesce((
          select jsonb_agg(lower(o.value) order by lower(o.value))
          from jsonb_array_elements_text(
            case when jsonb_typeof(e.value -> 'option_ids') = 'array' then e.value -> 'option_ids' else '[]'::jsonb end
          ) as o(value)
        ), '[]'::jsonb),
        'n', nullif(btrim(regexp_replace(coalesce(e.value ->> 'note', ''), '\s+', ' ', 'g')), '')
      ) order by e.ordinality)
      from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
        with ordinality as e(value, ordinality)
    ), '[]'::jsonb),
    'name', btrim(regexp_replace(coalesce(p_customer_name, ''), '\s+', ' ', 'g')),
    'student', nullif(btrim(coalesce(p_student_identifier, '')), '')
  )::text, 'UTF8'), 'sha256'), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- create_pending_order — service_role only (called by the create-payment-order
-- Edge Function after it has authenticated the student).
--
-- Idempotent per (user, idempotency key): repeating a submission returns the
-- same order instead of creating a duplicate, and reusing a key for a
-- different cart is rejected.
-- -----------------------------------------------------------------------------
create or replace function public.create_pending_order(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_customer_name text,
  p_student_identifier text default null,
  p_terms_accepted boolean default false,
  p_access_token_hash text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.canteen_settings;
  v_fingerprint text;
  v_existing public.orders;
  v_order public.orders;
  v_status jsonb;
  v_quote jsonb;
  v_name text;
  v_student text;
begin
  if p_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001', hint = 'Sign-in is required to place an order.';
  end if;
  if p_idempotency_key is null then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Missing idempotency key.';
  end if;
  if p_access_token_hash is not null and p_access_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Invalid access token hash.';
  end if;

  select * into s from public.canteen_settings where id = 1;

  v_name := btrim(regexp_replace(coalesce(p_customer_name, ''), '\s+', ' ', 'g'));
  v_student := nullif(btrim(coalesce(p_student_identifier, '')), '');
  if s.student_id_mode = 'hidden' then
    v_student := null;
  end if;
  v_fingerprint := public.checkout_fingerprint(p_items, v_name, v_student);

  -- Duplicate submission? Return the original order.
  select * into v_existing
    from public.orders
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001', hint = 'This checkout request was already used for a different cart.';
    end if;
    if p_access_token_hash is not null then
      insert into public.order_access_tokens (order_id, token_hash)
      values (v_existing.id, p_access_token_hash)
      on conflict (order_id) do update set token_hash = excluded.token_hash, created_at = now();
    end if;
    return public.pending_order_result(v_existing, true);
  end if;

  v_status := public.get_ordering_status();
  if not (v_status ->> 'is_open')::boolean then
    raise exception 'ORDERING_CLOSED'
      using errcode = 'P0001', detail = v_status ->> 'reason', hint = v_status ->> 'message';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 40 or v_name ~ '[\x00-\x1F\x7F<>]' then
    raise exception 'INVALID_CUSTOMER_NAME'
      using errcode = 'P0001', hint = 'Please enter a name between 2 and 40 characters.';
  end if;
  if s.student_id_mode = 'required' and v_student is null then
    raise exception 'STUDENT_ID_REQUIRED' using errcode = 'P0001', hint = format('%s is required.', s.student_id_label);
  end if;
  if v_student is not null and (char_length(v_student) > 40 or v_student !~ '^[A-Za-z0-9 ./_-]+$') then
    raise exception 'INVALID_STUDENT_ID'
      using errcode = 'P0001', hint = format('%s may only contain letters, numbers, spaces and . / _ -', s.student_id_label);
  end if;
  if not coalesce(p_terms_accepted, false) then
    raise exception 'TERMS_NOT_ACCEPTED' using errcode = 'P0001', hint = 'Please accept the ordering terms.';
  end if;

  v_quote := public.price_cart(p_items, true);

  if (v_quote ->> 'item_count')::integer > s.max_items_per_order then
    raise exception 'TOO_MANY_ITEMS'
      using errcode = 'P0001', hint = format('A single order can contain at most %s items.', s.max_items_per_order);
  end if;

  begin
    insert into public.orders (
      order_number, user_id, customer_name, student_identifier,
      subtotal_paise, total_paise, item_count,
      idempotency_key, request_fingerprint, terms_accepted_at, payment_expires_at
    ) values (
      public.next_order_number(), p_user_id, v_name, v_student,
      (v_quote ->> 'subtotal_paise')::integer, (v_quote ->> 'total_paise')::integer,
      (v_quote ->> 'item_count')::integer,
      p_idempotency_key, v_fingerprint, now(),
      now() + make_interval(mins => s.pending_payment_window_minutes)
    )
    returning * into v_order;
  exception when unique_violation then
    -- A concurrent request with the same idempotency key won the race.
    select * into v_existing
      from public.orders
     where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if not found then
      raise;
    end if;
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001', hint = 'This checkout request was already used for a different cart.';
    end if;
    return public.pending_order_result(v_existing, true);
  end;

  insert into public.order_items (
    order_id, line_number, menu_item_id, item_name, is_vegetarian,
    base_price_paise, unit_price_paise, quantity, line_total_paise,
    customizations, special_instructions
  )
  select v_order.id,
         l.ordinality,
         (l.value ->> 'menu_item_id')::uuid,
         l.value ->> 'name',
         (l.value ->> 'is_vegetarian')::boolean,
         (l.value ->> 'base_price_paise')::integer,
         (l.value ->> 'unit_price_paise')::integer,
         (l.value ->> 'quantity')::integer,
         (l.value ->> 'line_total_paise')::integer,
         l.value -> 'options',
         l.value ->> 'note'
    from jsonb_array_elements(v_quote -> 'lines') with ordinality as l(value, ordinality);

  if p_access_token_hash is not null then
    insert into public.order_access_tokens (order_id, token_hash) values (v_order.id, p_access_token_hash);
  end if;

  return public.pending_order_result(v_order, false);
end;
$$;

create or replace function public.pending_order_result(p_order public.orders, p_replayed boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', p_order.id,
    'order_number', p_order.order_number,
    'status', p_order.status,
    'payment_status', p_order.payment_status,
    'total_paise', p_order.total_paise,
    'currency', p_order.currency,
    'payment_expires_at', p_order.payment_expires_at,
    'replayed', p_replayed,
    'provider_order_id', (select p.provider_order_id from public.payments p where p.order_id = p_order.id)
  );
$$;

-- -----------------------------------------------------------------------------
-- prepare_order_payment — service_role only. Called before (re)opening the
-- payment window: verifies ownership, expiry, opening hours, and that every
-- item is still available at the price recorded on the order.
-- -----------------------------------------------------------------------------
create or replace function public.prepare_order_payment(p_order_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_status jsonb;
  v_changed jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id is distinct from p_user_id then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001', hint = 'Order not found.';
  end if;

  if v_order.status <> 'payment_pending' then
    return public.pending_order_result(v_order, true) || jsonb_build_object('ready', false);
  end if;

  if v_order.payment_expires_at <= now() then
    raise exception 'ORDER_EXPIRED'
      using errcode = 'P0001', hint = 'The payment window for this order has closed. Please place a new order.';
  end if;

  v_status := public.get_ordering_status();
  if not (v_status ->> 'is_open')::boolean then
    raise exception 'ORDERING_CLOSED'
      using errcode = 'P0001', detail = v_status ->> 'reason', hint = v_status ->> 'message';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', oi.item_name, 'line_number', oi.line_number)), '[]'::jsonb)
    into v_changed
    from public.order_items oi
    left join public.menu_items mi on mi.id = oi.menu_item_id
    left join public.categories c on c.id = mi.category_id
   where oi.order_id = v_order.id
     and (
       mi.id is null
       or not (mi.is_active and c.is_active and mi.is_available)
       or mi.price_paise <> oi.base_price_paise
       or oi.unit_price_paise <> mi.price_paise + coalesce((
            select sum(o.price_delta_paise)
            from public.menu_item_options o
            where o.menu_item_id = mi.id
              and o.is_available
              and o.id in (
                select (x.value ->> 'id')::uuid from jsonb_array_elements(oi.customizations) as x(value)
              )
          ), 0)
       or jsonb_array_length(oi.customizations) <> (
            select count(*) from public.menu_item_options o
            where o.menu_item_id = mi.id
              and o.is_available
              and o.id in (
                select (x.value ->> 'id')::uuid from jsonb_array_elements(oi.customizations) as x(value)
              )
          )
     );

  if jsonb_array_length(v_changed) > 0 then
    raise exception 'MENU_CHANGED'
      using errcode = 'P0001',
            detail = v_changed::text,
            hint = 'Some items or prices changed since this order was created. Please review your cart.';
  end if;

  return public.pending_order_result(v_order, true) || jsonb_build_object('ready', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- attach_provider_order — service_role only. Links exactly one Razorpay order
-- to a pending order; concurrent callers converge on the first one stored.
-- -----------------------------------------------------------------------------
create or replace function public.attach_provider_order(
  p_order_id uuid,
  p_provider_order_id text,
  p_amount_paise integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order.status <> 'payment_pending' then
    raise exception 'ORDER_NOT_PENDING' using errcode = 'P0001', hint = 'This order is no longer awaiting payment.';
  end if;
  if p_amount_paise is distinct from v_order.total_paise then
    raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001';
  end if;
  if p_provider_order_id is null or p_provider_order_id !~ '^order_[A-Za-z0-9]{6,40}$' then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Invalid provider order id.';
  end if;

  insert into public.payments (order_id, provider, provider_order_id, amount_paise, currency)
  values (v_order.id, 'razorpay', p_provider_order_id, v_order.total_paise, v_order.currency)
  on conflict (order_id) do nothing;

  select * into v_payment from public.payments where order_id = v_order.id;
  return jsonb_build_object(
    'provider_order_id', v_payment.provider_order_id,
    'amount_paise', v_payment.amount_paise,
    'currency', v_payment.currency
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- get_payment_context — service_role only. Looks up an order and its payment
-- by our order id or by the provider (Razorpay) order id.
-- -----------------------------------------------------------------------------
create or replace function public.get_payment_context(
  p_order_id uuid default null,
  p_provider_order_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', o.id,
    'user_id', o.user_id,
    'order_number', o.order_number,
    'status', o.status,
    'payment_status', o.payment_status,
    'total_paise', o.total_paise,
    'currency', o.currency,
    'payment_expires_at', o.payment_expires_at,
    'provider_order_id', p.provider_order_id,
    'provider_payment_id', p.provider_payment_id,
    'payment_record_status', p.status
  )
  from public.orders o
  left join public.payments p on p.order_id = o.id
  where (p_order_id is not null and o.id = p_order_id)
     or (p_order_id is null and p_provider_order_id is not null and p.provider_order_id = p_provider_order_id)
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- get_order_receipt — the only way students read payment/timeline details.
--
-- Authorised when the caller (a) owns the order, (b) is staff, or (c) presents
-- the order's secret access token. Unauthorised and non-existent orders both
-- return NULL so the response never reveals whether an order exists.
-- -----------------------------------------------------------------------------
create or replace function public.get_order_receipt(
  p_order_id uuid default null,
  p_access_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_order_id uuid;
  v_is_owner boolean;
  v_payment public.payments;
  s public.canteen_settings;
begin
  if p_access_token is not null then
    if char_length(p_access_token) not between 32 and 128 then
      return null;
    end if;
    select t.order_id into v_order_id
      from public.order_access_tokens t
     where t.token_hash = encode(extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'), 'hex');
    if v_order_id is null or (p_order_id is not null and p_order_id <> v_order_id) then
      return null;
    end if;
    select * into v_order from public.orders where id = v_order_id;
  elsif p_order_id is not null then
    select * into v_order from public.orders where id = p_order_id;
    if not found then
      return null;
    end if;
    if not ((auth.uid() is not null and v_order.user_id = auth.uid()) or public.has_staff_access()) then
      return null;
    end if;
  else
    return null;
  end if;

  if v_order.id is null then
    return null;
  end if;

  v_is_owner := auth.uid() is not null and v_order.user_id = auth.uid();
  select * into v_payment from public.payments where order_id = v_order.id;
  select * into s from public.canteen_settings where id = 1;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'customer_name', v_order.customer_name,
    'student_identifier', v_order.student_identifier,
    'created_at', v_order.created_at,
    'paid_at', v_order.paid_at,
    'payment_expires_at', v_order.payment_expires_at,
    'subtotal_paise', v_order.subtotal_paise,
    'total_paise', v_order.total_paise,
    'currency', v_order.currency,
    'amount_refunded_paise', coalesce(v_payment.amount_refunded_paise, 0),
    'cancellation_reason', v_order.cancellation_reason,
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', oi.item_name,
        'quantity', oi.quantity,
        'unit_price_paise', oi.unit_price_paise,
        'line_total_paise', oi.line_total_paise,
        'is_vegetarian', oi.is_vegetarian,
        'customizations', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'name', c.value ->> 'name',
            'price_delta_paise', (c.value ->> 'price_delta_paise')::integer
          )), '[]'::jsonb)
          from jsonb_array_elements(oi.customizations) as c(value)
        ),
        'note', oi.special_instructions
      ) order by oi.line_number), '[]'::jsonb)
      from public.order_items oi
      where oi.order_id = v_order.id
    ),
    'payment', case
      when v_payment.status in ('captured', 'partially_refunded', 'refunded') then jsonb_build_object(
        'provider', v_payment.provider,
        'provider_payment_id', v_payment.provider_payment_id,
        'method', v_payment.method,
        'verified_at', v_payment.verified_at
      )
    end,
    'timeline', (
      select coalesce(jsonb_agg(jsonb_build_object('status', h.new_status, 'at', h.created_at)
                                order by h.created_at, h.id), '[]'::jsonb)
      from public.order_status_history h
      where h.order_id = v_order.id
    ),
    'canteen', jsonb_build_object('name', s.canteen_name, 'pickup_instructions', s.pickup_instructions),
    'is_owner', v_is_owner,
    'can_resume_payment', v_is_owner and v_order.status = 'payment_pending' and v_order.payment_expires_at > now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.get_ordering_status(timestamptz) from public, anon, authenticated;
revoke all on function public.get_public_settings() from public, anon, authenticated;
revoke all on function public.price_cart(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.quote_cart(jsonb) from public, anon, authenticated;
revoke all on function public.next_order_number() from public, anon, authenticated;
revoke all on function public.checkout_fingerprint(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.create_pending_order(uuid, uuid, jsonb, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.pending_order_result(public.orders, boolean) from public, anon, authenticated;
revoke all on function public.prepare_order_payment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.attach_provider_order(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.get_payment_context(uuid, text) from public, anon, authenticated;
revoke all on function public.get_order_receipt(uuid, text) from public, anon, authenticated;

-- Public read-only endpoints
grant execute on function public.get_ordering_status(timestamptz) to anon, authenticated, service_role;
grant execute on function public.get_public_settings() to anon, authenticated, service_role;
grant execute on function public.price_cart(jsonb, boolean) to anon, authenticated, service_role;
grant execute on function public.quote_cart(jsonb) to anon, authenticated, service_role;
grant execute on function public.get_order_receipt(uuid, text) to anon, authenticated, service_role;

-- Server-only (Edge Functions with the service role key)
grant execute on function public.next_order_number() to service_role;
grant execute on function public.checkout_fingerprint(jsonb, text, text) to service_role;
grant execute on function public.create_pending_order(uuid, uuid, jsonb, text, text, boolean, text) to service_role;
grant execute on function public.pending_order_result(public.orders, boolean) to service_role;
grant execute on function public.prepare_order_payment(uuid, uuid) to service_role;
grant execute on function public.attach_provider_order(uuid, text, integer) to service_role;
grant execute on function public.get_payment_context(uuid, text) to service_role;
