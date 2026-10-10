/**
 * Security tests: RLS coverage, function privileges, ownership (IDOR) and
 * protection against privilege escalation and payment forgery.
 */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createPaidOrderFixture, createPendingOrderFixture } from './helpers/fixtures.ts';
import { createStaff, createUser, expectDbError, query, rpc, SEED, sessions, superQuery } from './helpers/db.ts';

describe('schema hardening', () => {
  it('enables RLS on every table in the public schema', async () => {
    const { rows } = await superQuery<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((row) => row.relname)).toEqual([]);
  });

  it('exposes only an explicit allowlist of functions to anonymous callers', async () => {
    const { rows } = await superQuery<{ proname: string }>(`
      select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    expect(rows.map((row) => row.proname)).toEqual([
      'get_order_receipt',
      'get_ordering_status',
      'get_public_settings',
      'has_role',
      'has_staff_access',
      'is_admin',
      'is_valid_opening_hours',
      'is_valid_order_transition',
      'is_valid_staff_transition',
      'price_cart',
      'quote_cart',
      'try_parse_uuid',
    ]);
  });

  it('never lets API roles execute payment or order-creation functions', async () => {
    const serverOnly = [
      'create_pending_order',
      'prepare_order_payment',
      'attach_provider_order',
      'get_payment_context',
      'confirm_order_payment',
      'record_payment_failure',
      'begin_webhook_event',
      'finish_webhook_event',
      'record_refund_event',
      'mark_refund_failed',
      'check_rate_limit',
      'next_order_number',
    ];
    const { rows } = await superQuery<{ proname: string; anon: boolean; authenticated: boolean; service: boolean }>(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('service_role', p.oid, 'execute') as service
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1)`,
      [serverOnly],
    );
    expect(rows).toHaveLength(serverOnly.length);
    for (const row of rows) {
      expect(row, row.proname).toMatchObject({ anon: false, authenticated: false, service: true });
    }
  });

  it('sets a fixed search_path on every SECURITY DEFINER function', async () => {
    const { rows } = await superQuery<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(rows).toEqual([]);
  });

  it('publishes only the orders table to Realtime', async () => {
    const { rows } = await superQuery<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`,
    );
    expect(rows.map((row) => row.tablename)).toEqual(['orders']);
  });
});

describe('public menu access', () => {
  it('lets anonymous visitors read listed menu items, including sold-out ones', async () => {
    const { rows } = await query<{ id: string; is_available: boolean }>(
      sessions.anon(),
      `select id, is_available from public.menu_items where id = any($1)`,
      [[SEED.items.masalaDosa, SEED.items.alooParatha]],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === SEED.items.alooParatha)?.is_available).toBe(false);
  });

  it('hides archived items and items in inactive categories from the public', async () => {
    const categoryId = randomUUID();
    const hiddenItem = randomUUID();
    const archivedItem = randomUUID();
    await superQuery(`insert into public.categories (id, name, slug, is_active) values ($1, 'Hidden', $2, false)`, [
      categoryId,
      `hidden-${categoryId.slice(0, 8)}`,
    ]);
    await superQuery(
      `insert into public.menu_items (id, category_id, name, price_paise) values ($1, $2, 'Secret item', 5000)`,
      [hiddenItem, categoryId],
    );
    await superQuery(
      `insert into public.menu_items (id, category_id, name, price_paise, is_active) values ($1, $2, 'Archived item', 5000, false)`,
      [archivedItem, SEED.categories.snacks],
    );

    const anon = await query(sessions.anon(), `select id from public.menu_items where id = any($1)`, [
      [hiddenItem, archivedItem],
    ]);
    expect(anon.rows).toEqual([]);

    const staffId = await createStaff('staff');
    const staff = await query(sessions.user(staffId), `select id from public.menu_items where id = any($1)`, [
      [hiddenItem, archivedItem],
    ]);
    expect(staff.rows).toHaveLength(2);
  });

  it('prevents anyone but admins from changing the menu', async () => {
    const studentId = await createUser();
    const staffId = await createStaff('staff');
    for (const session of [sessions.anon(), sessions.student(studentId), sessions.user(staffId)]) {
      const updated = await query(session, `update public.menu_items set price_paise = 100 where id = $1`, [
        SEED.items.chai,
      ]).catch((error: Error) => error);
      // Either privilege is missing (anon) or RLS filters the row out (0 rows).
      if (updated instanceof Error) expect(updated.message).toMatch(/permission denied/);
      else expect(updated.rowCount).toBe(0);
    }
    const { rows } = await superQuery<{ price_paise: number }>(
      `select price_paise from public.menu_items where id = $1`,
      [SEED.items.chai],
    );
    expect(rows[0]?.price_paise).toBe(1500);
  });

  it('lets admins edit the menu and records an audit trail', async () => {
    const adminId = await createStaff('admin', 'Menu Admin');
    const itemId = randomUUID();
    await query(
      sessions.user(adminId),
      `insert into public.menu_items (id, category_id, name, price_paise) values ($1, $2, 'Lemon Rice', 6500)`,
      [itemId, SEED.categories.breakfast],
    );
    await query(sessions.user(adminId), `update public.menu_items set price_paise = 7000 where id = $1`, [itemId]);
    const { rows } = await superQuery<{ action: string; actor_id: string }>(
      `select action, actor_id from public.audit_log where table_name = 'menu_items' and record_id = $1 order by id`,
      [itemId],
    );
    expect(rows.map((row) => row.action)).toEqual(['INSERT', 'UPDATE']);
    expect(rows.every((row) => row.actor_id === adminId)).toBe(true);
  });

  it('only lets admins update canteen settings', async () => {
    const staffId = await createStaff('staff');
    const result = await query(sessions.user(staffId), `update public.canteen_settings set canteen_name = 'Hacked'`);
    expect(result.rowCount).toBe(0);
    await expectDbError(query(sessions.anon(), `update public.canteen_settings set canteen_name = 'Hacked'`), 'permission denied');
  });
});

describe('order ownership (IDOR protection)', () => {
  it('lets a student read only their own orders and items', async () => {
    const mine = await createPendingOrderFixture();
    const theirs = await createPendingOrderFixture();

    const orders = await query<{ id: string }>(sessions.student(mine.userId), `select id from public.orders`);
    expect(orders.rows.map((row) => row.id)).toEqual([mine.order.order_id]);

    const items = await query(sessions.student(mine.userId), `select id from public.order_items where order_id = $1`, [
      theirs.order.order_id,
    ]);
    expect(items.rows).toEqual([]);
  });

  it('denies anonymous visitors any access to orders, payments and customer data', async () => {
    await createPaidOrderFixture();
    for (const table of ['orders', 'order_items', 'payments', 'refunds', 'order_status_history', 'profiles']) {
      await expectDbError(query(sessions.anon(), `select * from public.${table} limit 1`), 'permission denied');
    }
  });

  it('hides payment records, refunds and history from students (receipt RPC only)', async () => {
    const paid = await createPaidOrderFixture();
    for (const table of ['payments', 'refunds', 'order_status_history', 'payment_webhook_events', 'audit_log']) {
      const { rows } = await query(sessions.student(paid.userId), `select * from public.${table}`);
      expect(rows, table).toEqual([]);
    }
  });

  it('never exposes access tokens, counters or rate limits through the API', async () => {
    const studentId = await createUser();
    for (const table of ['order_access_tokens', 'order_number_counters', 'rate_limits']) {
      await expectDbError(query(sessions.student(studentId), `select * from public.${table}`), 'permission denied');
    }
  });

  it('lets staff read every order', async () => {
    const order = await createPendingOrderFixture();
    const staffId = await createStaff('staff');
    const { rows } = await query(sessions.user(staffId), `select id from public.orders where id = $1`, [
      order.order.order_id,
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe('payment forgery and privilege escalation', () => {
  it('rejects direct order updates from students and staff', async () => {
    const { userId, order } = await createPendingOrderFixture();
    const staffId = await createStaff('admin');
    for (const session of [sessions.student(userId), sessions.user(staffId)]) {
      await expectDbError(
        query(session, `update public.orders set status = 'confirmed', payment_status = 'paid' where id = $1`, [
          order.order_id,
        ]),
        'permission denied',
      );
    }
  });

  it('rejects inserting orders or payments directly', async () => {
    const studentId = await createUser();
    await expectDbError(
      query(sessions.student(studentId), `insert into public.payments (order_id, provider_order_id, amount_paise) values (gen_random_uuid(), 'order_x', 100)`),
      'permission denied',
    );
  });

  it('rejects calling the payment confirmation function from the browser', async () => {
    const { userId, providerOrderId } = await createPendingOrderFixture();
    await expectDbError(
      rpc(sessions.student(userId)).call('confirm_order_payment', {
        p_provider_order_id: providerOrderId,
        p_provider_payment_id: 'pay_forged123456',
        p_amount_paise: 1,
        p_currency: 'INR',
        p_method: 'upi',
        p_source: 'checkout',
      }),
      /permission denied|FORBIDDEN/,
    );
  });

  it('enforces payment invariants even for trusted database code', async () => {
    const { order } = await createPendingOrderFixture();
    await expectDbError(
      superQuery(`update public.orders set status = 'confirmed' where id = $1`, [order.order_id]),
      /PAYMENT_NOT_VERIFIED|orders_kitchen_states_require_payment/,
    );
    await expectDbError(
      superQuery(`update public.orders set total_paise = 100, subtotal_paise = 100 where id = $1`, [order.order_id]),
      'ORDER_IMMUTABLE_FIELD',
    );
  });

  it('prevents users from granting themselves a role', async () => {
    const userId = await createUser({ anonymous: false, email: `${randomUUID()}@example.test` });
    await expectDbError(
      query(sessions.user(userId), `insert into public.user_roles (user_id, role) values ($1, 'admin')`, [userId]),
      'permission denied',
    );
    const role = await query<{ role: string | null }>(sessions.user(userId), `select public.get_my_staff_role() as role`);
    expect(role.rows[0]?.role).toBeNull();
  });

  it('never treats an anonymous (guest) session as staff, even with a role row', async () => {
    const guestId = await createUser({ anonymous: true });
    await superQuery(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [guestId]);
    const { rows } = await query<{ staff: boolean }>(sessions.student(guestId), `select public.has_staff_access() as staff`);
    expect(rows[0]?.staff).toBe(false);
  });

  it('only lets admins upload menu images to storage', async () => {
    const adminId = await createStaff('admin');
    const staffId = await createStaff('staff');
    await query(
      sessions.user(adminId),
      `insert into storage.objects (bucket_id, name) values ('menu-images', $1)`,
      [`items/${randomUUID()}.webp`],
    );
    await expectDbError(
      query(sessions.user(staffId), `insert into storage.objects (bucket_id, name) values ('menu-images', $1)`, [
        `items/${randomUUID()}.webp`,
      ]),
      'row-level security',
    );
    await expectDbError(
      query(sessions.user(adminId), `insert into storage.objects (bucket_id, name) values ('menu-images', $1)`, [
        `items/${randomUUID()}.svg`,
      ]),
      'row-level security',
    );
  });
});
