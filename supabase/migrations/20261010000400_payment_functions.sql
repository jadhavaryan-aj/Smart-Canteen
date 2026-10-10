-- =============================================================================
-- Campus Table — payments. Every function here is service_role only: it is
-- called by Edge Functions *after* they have verified a Razorpay signature
-- (checkout handler) or webhook signature. Browsers can never call them.
--
-- All functions are idempotent: Razorpay retries webhooks, students double-tap
-- buttons, and checkout callbacks race with webhooks. Row locks serialise
-- concurrent confirmations of the same payment.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- confirm_order_payment: record a verified, captured payment and confirm the
-- order. Results:
--   confirmed               — the order moved payment_pending → confirmed
--   already_confirmed       — this exact payment was already recorded (no-op)
--   duplicate_payment       — a *different* payment was captured for an order
--                             that is already paid (needs a manual refund)
--   paid_after_cancellation — the order was cancelled before payment arrived
--   amount_mismatch         — amount/currency do not match; order NOT confirmed
--   unknown_order           — no payment record for this provider order id
-- -----------------------------------------------------------------------------
create or replace function public.confirm_order_payment(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount_paise integer,
  p_currency text,
  p_method text,
  p_source text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_result text;
begin
  if p_source is null or p_source not in ('checkout', 'webhook') then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Invalid verification source.';
  end if;
  if p_provider_payment_id is null or p_provider_payment_id !~ '^pay_[A-Za-z0-9]{6,40}$' then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Invalid provider payment id.';
  end if;

  select * into v_payment from public.payments where provider_order_id = p_provider_order_id for update;
  if not found then
    return jsonb_build_object('result', 'unknown_order');
  end if;
  select * into v_order from public.orders where id = v_payment.order_id for update;

  if p_amount_paise is distinct from v_payment.amount_paise
     or upper(coalesce(p_currency, '')) <> v_payment.currency then
    update public.payments
       set failure_code = 'AMOUNT_MISMATCH',
           failure_reason = left(format('Expected %s %s but provider reported %s %s',
             v_payment.amount_paise, v_payment.currency, p_amount_paise, p_currency), 300)
     where id = v_payment.id;
    return jsonb_build_object(
      'result', 'amount_mismatch',
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'payment_status', v_order.payment_status
    );
  end if;

  if v_payment.status in ('captured', 'partially_refunded', 'refunded') then
    return jsonb_build_object(
      'result', case when v_payment.provider_payment_id = p_provider_payment_id
                     then 'already_confirmed' else 'duplicate_payment' end,
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'payment_status', v_order.payment_status
    );
  end if;

  update public.payments
     set status = 'captured',
         provider_payment_id = p_provider_payment_id,
         method = left(nullif(p_method, ''), 32),
         verified_at = now(),
         verification_source = p_source,
         failure_code = null,
         failure_reason = null
   where id = v_payment.id;

  if v_order.status = 'payment_pending' then
    perform set_config('app.status_source', 'payment', true);
    perform set_config('app.status_note',
      case p_source when 'webhook' then 'Payment verified (Razorpay webhook)' else 'Payment verified (checkout signature)' end,
      true);
    update public.orders
       set status = 'confirmed', payment_status = 'paid', paid_at = now()
     where id = v_order.id
     returning * into v_order;
    perform set_config('app.status_source', '', true);
    perform set_config('app.status_note', '', true);
    v_result := 'confirmed';
  elsif v_order.status = 'cancelled' then
    update public.orders
       set payment_status = 'paid', paid_at = coalesce(paid_at, now())
     where id = v_order.id
     returning * into v_order;
    v_result := 'paid_after_cancellation';
  else
    v_result := 'already_confirmed';
  end if;

  return jsonb_build_object(
    'result', v_result,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'payment_status', v_order.payment_status
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- record_payment_failure: a payment attempt failed. The order stays
-- payment_pending (the student may retry) unless it was already paid.
-- -----------------------------------------------------------------------------
create or replace function public.record_payment_failure(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_error_code text,
  p_error_description text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where provider_order_id = p_provider_order_id for update;
  if not found then
    return jsonb_build_object('result', 'unknown_order');
  end if;
  if v_payment.status in ('captured', 'partially_refunded', 'refunded') then
    return jsonb_build_object('result', 'ignored_already_paid');
  end if;

  update public.payments
     set status = 'failed',
         last_failed_payment_id = left(p_provider_payment_id, 64),
         failure_code = left(p_error_code, 100),
         failure_reason = left(p_error_description, 300)
   where id = v_payment.id;

  update public.orders
     set payment_status = 'failed'
   where id = v_payment.order_id and status = 'payment_pending' and payment_status = 'pending';

  return jsonb_build_object('result', 'recorded', 'order_id', v_payment.order_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Webhook idempotency. begin_webhook_event registers a delivery (or counts a
-- retry) and says whether it still needs processing.
-- -----------------------------------------------------------------------------
create or replace function public.begin_webhook_event(p_event_id text, p_event_type text, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_attempts integer;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 128 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Invalid event id.';
  end if;

  insert into public.payment_webhook_events as e (provider, event_id, event_type, payload)
  values ('razorpay', p_event_id, left(coalesce(p_event_type, 'unknown'), 64), coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_id) do update set attempts = e.attempts + 1
  returning e.status, e.attempts into v_status, v_attempts;

  return jsonb_build_object(
    'should_process', v_status in ('received', 'failed'),
    'status', v_status,
    'attempts', v_attempts
  );
end;
$$;

create or replace function public.finish_webhook_event(p_event_id text, p_status text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_status not in ('processed', 'ignored', 'failed') then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  update public.payment_webhook_events
     set status = p_status,
         processing_note = left(p_note, 500),
         processed_at = case when p_status = 'failed' then null else now() end
   where provider = 'razorpay' and event_id = p_event_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Refunds. record_refund_event is driven by Razorpay (refund API responses and
-- refund.* webhooks); it recomputes the payment's refunded amount from
-- processed refunds so repeated events cannot double count.
-- -----------------------------------------------------------------------------
create or replace function public.record_refund_event(
  p_provider_refund_id text,
  p_provider_payment_id text,
  p_amount_paise integer,
  p_status text,
  p_internal_refund_id uuid default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_refund public.refunds;
  v_refunded integer;
begin
  if p_status not in ('pending', 'processed', 'failed') then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Invalid refund status.';
  end if;
  if p_provider_refund_id is null or p_provider_refund_id !~ '^rfnd_[A-Za-z0-9]{6,40}$' then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Invalid provider refund id.';
  end if;

  select * into v_payment from public.payments where provider_payment_id = p_provider_payment_id for update;
  if not found then
    return jsonb_build_object('result', 'unknown_payment');
  end if;
  if p_amount_paise is null or p_amount_paise < 1 or p_amount_paise > v_payment.amount_paise then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001', hint = 'Invalid refund amount.';
  end if;
  select * into v_order from public.orders where id = v_payment.order_id for update;

  select * into v_refund from public.refunds where provider_refund_id = p_provider_refund_id for update;
  if not found and p_internal_refund_id is not null then
    select * into v_refund
      from public.refunds
     where id = p_internal_refund_id and payment_id = v_payment.id
     for update;
  end if;

  if v_refund.id is null then
    insert into public.refunds (order_id, payment_id, provider_refund_id, amount_paise, status, reason)
    values (v_order.id, v_payment.id, p_provider_refund_id, p_amount_paise, 'pending', 'Refund recorded from Razorpay')
    returning * into v_refund;
  end if;

  if v_refund.status = 'processed' and p_status <> 'processed' then
    return jsonb_build_object('result', 'ignored', 'refund_id', v_refund.id);
  end if;

  update public.refunds
     set provider_refund_id = coalesce(provider_refund_id, p_provider_refund_id),
         amount_paise = p_amount_paise,
         status = p_status::public.refund_status,
         processed_at = case when p_status = 'processed' then coalesce(processed_at, now()) end,
         failure_reason = case when p_status = 'failed' then left(p_failure_reason, 300) end,
         attempt_started_at = null
   where id = v_refund.id;

  select coalesce(sum(amount_paise), 0) into v_refunded
    from public.refunds
   where payment_id = v_payment.id and status = 'processed';
  v_refunded := least(v_refunded, v_payment.amount_paise);

  update public.payments
     set amount_refunded_paise = v_refunded,
         status = case
           when v_refunded >= amount_paise then 'refunded'::public.payment_record_status
           when v_refunded > 0 then 'partially_refunded'::public.payment_record_status
           else status
         end
   where id = v_payment.id;

  update public.orders
     set payment_status = case
           when v_refunded >= v_payment.amount_paise then 'refunded'::public.payment_status
           when v_refunded > 0 then 'partially_refunded'::public.payment_status
           else 'refund_pending'::public.payment_status
         end
   where id = v_order.id
   returning * into v_order;

  -- A fully refunded order can no longer be prepared or collected.
  if v_refunded >= v_payment.amount_paise and v_order.status in ('confirmed', 'accepted', 'preparing', 'ready') then
    perform set_config('app.status_source', 'system', true);
    perform set_config('app.status_note', 'Payment refunded', true);
    update public.orders
       set status = 'cancelled', cancellation_reason = coalesce(cancellation_reason, 'Payment refunded')
     where id = v_order.id;
    perform set_config('app.status_source', '', true);
    perform set_config('app.status_note', '', true);
  end if;

  return jsonb_build_object('result', 'recorded', 'refund_id', v_refund.id, 'amount_refunded_paise', v_refunded);
end;
$$;

-- The refund API call failed before Razorpay accepted it.
create or replace function public.mark_refund_failed(p_refund_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.refunds
     set status = 'failed', failure_reason = left(p_reason, 300), attempt_started_at = null
   where id = p_refund_id and status = 'pending' and provider_refund_id is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixed-window rate limiter. Returns true when the call is within the limit.
-- -----------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 200
     or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: service_role only.
-- -----------------------------------------------------------------------------
revoke all on function public.confirm_order_payment(text, text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.record_payment_failure(text, text, text, text) from public, anon, authenticated;
revoke all on function public.begin_webhook_event(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.finish_webhook_event(text, text, text) from public, anon, authenticated;
revoke all on function public.record_refund_event(text, text, integer, text, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_refund_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;

grant execute on function public.confirm_order_payment(text, text, integer, text, text, text) to service_role;
grant execute on function public.record_payment_failure(text, text, text, text) to service_role;
grant execute on function public.begin_webhook_event(text, text, jsonb) to service_role;
grant execute on function public.finish_webhook_event(text, text, text) to service_role;
grant execute on function public.record_refund_event(text, text, integer, text, uuid, text) to service_role;
grant execute on function public.mark_refund_failed(uuid, text) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
