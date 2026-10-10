-- =============================================================================
-- Campus Table — staff and admin operations.
--
-- These functions are callable by signed-in users but check the caller's role
-- from public.user_roles first (the browser is never trusted). They are the
-- only way order status changes after payment, and they can never mark an
-- order paid or alter payment verification.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- staff_update_order_status
--   * staff and admins: confirmed → accepted → preparing → ready → completed
--     (plus ready → preparing to undo an accidental "ready")
--   * admins only: cancel (a reason is required). Cancelling a paid order
--     records a pending refund which the update-order-status Edge Function
--     submits to Razorpay.
--   * p_expected_status gives optimistic concurrency: two tablets pressing
--     different buttons cannot silently overwrite each other.
-- -----------------------------------------------------------------------------
create or replace function public.staff_update_order_status(
  p_order_id uuid,
  p_new_status public.order_status,
  p_expected_status public.order_status default null,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
begin
  if not public.has_staff_access() then
    raise exception 'FORBIDDEN' using errcode = '42501', hint = 'Staff access is required.';
  end if;
  v_is_admin := public.is_admin();

  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Notes must be at most 300 characters.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001', hint = 'Order not found.';
  end if;

  if v_order.status = p_new_status then
    return jsonb_build_object(
      'result', 'unchanged', 'order_id', v_order.id, 'order_number', v_order.order_number,
      'status', v_order.status, 'payment_status', v_order.payment_status, 'refund', null
    );
  end if;

  if p_expected_status is not null and v_order.status <> p_expected_status then
    raise exception 'STALE_STATUS'
      using errcode = 'P0001',
            detail = v_order.status::text,
            hint = 'This order was updated on another screen. The latest status has been loaded.';
  end if;

  if not public.is_valid_staff_transition(v_order.status, p_new_status) then
    raise exception 'INVALID_TRANSITION'
      using errcode = 'P0001',
            detail = format('%s -> %s', v_order.status, p_new_status),
            hint = 'This status change is not allowed.';
  end if;

  if p_new_status = 'cancelled' then
    if not v_is_admin then
      raise exception 'FORBIDDEN' using errcode = '42501', hint = 'Only administrators can cancel orders.';
    end if;
    if v_note is null or char_length(v_note) < 3 then
      raise exception 'REASON_REQUIRED' using errcode = 'P0001', hint = 'Please give a reason for cancelling.';
    end if;
  end if;

  perform set_config('app.status_source', case when v_is_admin then 'admin' else 'staff' end, true);
  perform set_config('app.status_note', coalesce(v_note, ''), true);

  update public.orders
     set status = p_new_status,
         cancellation_reason = case when p_new_status = 'cancelled' then v_note else cancellation_reason end,
         payment_status = case
           when p_new_status = 'cancelled' and payment_status = 'paid' then 'refund_pending'::public.payment_status
           else payment_status
         end
   where id = v_order.id
   returning * into v_order;

  perform set_config('app.status_source', '', true);
  perform set_config('app.status_note', '', true);

  if p_new_status = 'cancelled' and v_order.payment_status = 'refund_pending' then
    select * into v_payment from public.payments where order_id = v_order.id for update;
    if v_payment.amount_paise - v_payment.amount_refunded_paise > 0 then
      insert into public.refunds (order_id, payment_id, amount_paise, status, reason, initiated_by, attempt_started_at)
      values (
        v_order.id, v_payment.id, v_payment.amount_paise - v_payment.amount_refunded_paise,
        'pending', v_note, auth.uid(), now()
      )
      returning * into v_refund;
    end if;
  end if;

  return jsonb_build_object(
    'result', 'updated',
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'refund', case when v_refund.id is not null then jsonb_build_object(
      'refund_id', v_refund.id,
      'provider_payment_id', v_payment.provider_payment_id,
      'amount_paise', v_refund.amount_paise
    ) end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_prepare_refund: (re)start a refund for a cancelled, paid order — e.g.
-- after a failed refund API call, or when a payment arrived after the order
-- had been cancelled. Guards against two admins submitting simultaneously.
-- -----------------------------------------------------------------------------
create or replace function public.admin_prepare_refund(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
  v_amount integer;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501', hint = 'Only administrators can issue refunds.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order.status <> 'cancelled' then
    raise exception 'ORDER_NOT_CANCELLED' using errcode = 'P0001', hint = 'Cancel the order before refunding it.';
  end if;

  select * into v_payment from public.payments where order_id = v_order.id for update;
  if v_payment.id is null or v_payment.status not in ('captured', 'partially_refunded') then
    raise exception 'NOTHING_TO_REFUND' using errcode = 'P0001', hint = 'This order has no captured payment to refund.';
  end if;

  select * into v_refund
    from public.refunds
   where order_id = v_order.id and status = 'pending'
   order by created_at desc
   limit 1
   for update;

  if v_refund.id is not null then
    if v_refund.provider_refund_id is not null then
      raise exception 'REFUND_ALREADY_SUBMITTED'
        using errcode = 'P0001', hint = 'A refund has already been submitted to Razorpay and is processing.';
    end if;
    if v_refund.attempt_started_at is not null and v_refund.attempt_started_at > now() - interval '2 minutes' then
      raise exception 'REFUND_IN_PROGRESS' using errcode = 'P0001', hint = 'A refund attempt is already in progress.';
    end if;
    update public.refunds set attempt_started_at = now() where id = v_refund.id returning * into v_refund;
  else
    v_amount := v_payment.amount_paise - v_payment.amount_refunded_paise;
    if v_amount <= 0 then
      raise exception 'NOTHING_TO_REFUND' using errcode = 'P0001';
    end if;
    insert into public.refunds (order_id, payment_id, amount_paise, status, reason, initiated_by, attempt_started_at)
    values (v_order.id, v_payment.id, v_amount, 'pending',
            coalesce(v_order.cancellation_reason, 'Refund for cancelled order'), auth.uid(), now())
    returning * into v_refund;
    update public.orders set payment_status = 'refund_pending' where id = v_order.id and payment_status = 'paid';
  end if;

  return jsonb_build_object(
    'refund_id', v_refund.id,
    'provider_payment_id', v_payment.provider_payment_id,
    'amount_paise', v_refund.amount_paise
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Dashboard figures for a canteen-local day. Revenue counts only verified
-- (captured) payments; processed refunds are reported separately and
-- subtracted for the net figure.
-- -----------------------------------------------------------------------------
create or replace function public.get_dashboard_stats(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.canteen_settings;
  v_day date;
  v_start timestamptz;
  v_end timestamptz;
  v_gross bigint;
  v_refunded bigint;
begin
  if not public.has_staff_access() then
    raise exception 'FORBIDDEN' using errcode = '42501', hint = 'Staff access is required.';
  end if;

  select * into s from public.canteen_settings where id = 1;
  v_day := coalesce(p_day, (now() at time zone s.timezone)::date);
  v_start := v_day::timestamp at time zone s.timezone;
  v_end := (v_day + 1)::timestamp at time zone s.timezone;

  select coalesce(sum(amount_paise), 0) into v_gross
    from public.payments
   where status in ('captured', 'partially_refunded', 'refunded')
     and verified_at >= v_start and verified_at < v_end;

  select coalesce(sum(amount_paise), 0) into v_refunded
    from public.refunds
   where status = 'processed' and processed_at >= v_start and processed_at < v_end;

  return jsonb_build_object(
    'day', v_day,
    'timezone', s.timezone,
    'orders_today', (select count(*) from public.orders where paid_at >= v_start and paid_at < v_end),
    'awaiting_preparation', (select count(*) from public.orders where status in ('confirmed', 'accepted')),
    'preparing', (select count(*) from public.orders where status = 'preparing'),
    'ready_for_pickup', (select count(*) from public.orders where status = 'ready'),
    'completed_today', (
      select count(*) from public.orders
      where status = 'completed' and completed_at >= v_start and completed_at < v_end
    ),
    'cancelled_today', (
      select count(*) from public.orders
      where status = 'cancelled' and paid_at is not null and cancelled_at >= v_start and cancelled_at < v_end
    ),
    'gross_revenue_paise', v_gross,
    'refunded_paise', v_refunded,
    'net_revenue_paise', v_gross - v_refunded,
    'needs_attention', (
      select count(*) from public.orders
      where payment_status = 'refund_pending' or (status = 'cancelled' and payment_status = 'paid')
    ),
    'recent_activity', (
      select coalesce(jsonb_agg(a order by a.at desc), '[]'::jsonb)
      from (
        select h.id,
               o.id as order_id,
               o.order_number,
               h.previous_status,
               h.new_status,
               h.source,
               h.created_at as at,
               p.display_name as actor
          from public.order_status_history h
          join public.orders o on o.id = h.order_id
          left join public.profiles p on p.id = h.changed_by
         where h.new_status <> 'payment_pending'
         order by h.created_at desc
         limit 12
      ) a
    )
  );
end;
$$;

-- Counter staff can mark items sold out / back in stock without full menu rights.
create or replace function public.set_menu_item_availability(p_item_id uuid, p_is_available boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.menu_items;
begin
  if not public.has_staff_access() then
    raise exception 'FORBIDDEN' using errcode = '42501', hint = 'Staff access is required.';
  end if;
  if p_is_available is null then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  update public.menu_items set is_available = p_is_available where id = p_item_id returning * into v_item;
  if v_item.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001', hint = 'Menu item not found.';
  end if;
  return jsonb_build_object('id', v_item.id, 'is_available', v_item.is_available);
end;
$$;

-- Counter staff can pause new orders during a rush.
create or replace function public.set_ordering_paused(p_paused boolean, p_message text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not public.has_staff_access() then
    raise exception 'FORBIDDEN' using errcode = '42501', hint = 'Staff access is required.';
  end if;
  if p_paused is null or (v_message is not null and char_length(v_message) > 200) then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Pause messages must be at most 200 characters.';
  end if;
  update public.canteen_settings
     set ordering_paused = p_paused,
         pause_message = case when p_paused then v_message else pause_message end
   where id = 1;
  return public.get_ordering_status();
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.staff_update_order_status(uuid, public.order_status, public.order_status, text) from public, anon, authenticated;
revoke all on function public.admin_prepare_refund(uuid) from public, anon, authenticated;
revoke all on function public.get_dashboard_stats(date) from public, anon, authenticated;
revoke all on function public.set_menu_item_availability(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_ordering_paused(boolean, text) from public, anon, authenticated;

-- Role checks happen inside each function.
grant execute on function public.staff_update_order_status(uuid, public.order_status, public.order_status, text) to authenticated;
grant execute on function public.admin_prepare_refund(uuid) to authenticated;
grant execute on function public.get_dashboard_stats(date) to authenticated;
grant execute on function public.set_menu_item_availability(uuid, boolean) to authenticated;
grant execute on function public.set_ordering_paused(boolean, text) to authenticated;
