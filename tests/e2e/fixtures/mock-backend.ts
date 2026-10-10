/**
 * A controlled, in-memory stand-in for Supabase (PostgREST, Auth, Edge
 * Functions, Realtime) and for Razorpay Checkout, used by the Playwright
 * tests. Everything is intercepted inside the browser: no request leaves the
 * machine, nothing is persisted, and no real payment can ever be made.
 *
 * The database rules themselves (pricing, RLS, payment verification) are
 * covered by the integration tests in supabase/tests against real Postgres;
 * these E2E tests verify the user-facing flows wired to those APIs.
 */
import type { Page, Route, WebSocketRoute } from '@playwright/test';

export const SUPABASE_URL = 'http://supabase.e2e.test';

type OrderStatus = 'payment_pending' | 'confirmed' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled';

interface MockItem {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_paise: number;
  image_url: string | null;
  is_vegetarian: boolean;
  is_available: boolean;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  options: { id: string; menu_item_id: string; name: string; price_delta_paise: number; is_available: boolean; sort_order: number }[];
}

interface MockOrder {
  id: string;
  order_number: string;
  user_id: string;
  customer_name: string;
  student_identifier: string | null;
  status: OrderStatus;
  payment_status: 'pending' | 'paid' | 'failed' | 'refund_pending' | 'refunded';
  total_paise: number;
  subtotal_paise: number;
  item_count: number;
  created_at: string;
  paid_at: string | null;
  payment_expires_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  provider_order_id: string;
  provider_payment_id: string | null;
  lines: {
    id: string;
    line_number: number;
    item_name: string;
    quantity: number;
    unit_price_paise: number;
    line_total_paise: number;
    is_vegetarian: boolean;
    customizations: { id: string; name: string; price_delta_paise: number }[];
    special_instructions: string | null;
  }[];
  history: { status: OrderStatus; at: string }[];
}

const CATEGORIES = [
  { id: '5eed0000-0000-4000-a000-000000000001', name: 'Breakfast', slug: 'breakfast', description: 'Served from opening until 11:30.', sort_order: 10, is_active: true },
  { id: '5eed0000-0000-4000-a000-000000000003', name: 'Snacks', slug: 'snacks', description: 'Quick bites between lectures.', sort_order: 30, is_active: true },
  { id: '5eed0000-0000-4000-a000-000000000004', name: 'Beverages', slug: 'beverages', description: 'Hot and cold drinks.', sort_order: 40, is_active: true },
];

function item(partial: Partial<MockItem> & Pick<MockItem, 'id' | 'category_id' | 'name' | 'price_paise'>): MockItem {
  return {
    description: '',
    image_url: null,
    is_vegetarian: true,
    is_available: true,
    is_active: true,
    is_featured: false,
    sort_order: 10,
    options: [],
    ...partial,
  };
}

function defaultMenu(): MockItem[] {
  return [
    item({
      id: '5eed0000-0000-4000-b000-000000000101',
      category_id: CATEGORIES[0]!.id,
      name: 'Masala Dosa',
      description: 'Crisp rice crêpe filled with spiced potato, served with coconut chutney and sambar.',
      price_paise: 7000,
      is_featured: true,
      options: [
        { id: '5eed0000-0000-4000-8000-000000000001', menu_item_id: '5eed0000-0000-4000-b000-000000000101', name: 'Extra chutney', price_delta_paise: 0, is_available: true, sort_order: 10 },
        { id: '5eed0000-0000-4000-8000-000000000002', menu_item_id: '5eed0000-0000-4000-b000-000000000101', name: 'Butter roast', price_delta_paise: 1000, is_available: true, sort_order: 20 },
      ],
    }),
    item({
      id: '5eed0000-0000-4000-b000-000000000104',
      category_id: CATEGORIES[0]!.id,
      name: 'Aloo Paratha',
      description: 'Whole-wheat flatbread stuffed with spiced potato, with curd and pickle.',
      price_paise: 6000,
      is_available: false,
      sort_order: 40,
    }),
    item({
      id: '5eed0000-0000-4000-b000-000000000301',
      category_id: CATEGORIES[1]!.id,
      name: 'Samosa (2 pcs)',
      description: 'Flaky pastry with spiced potato and peas, with mint and tamarind chutneys.',
      price_paise: 3000,
      is_featured: true,
    }),
    item({
      id: '5eed0000-0000-4000-b000-000000000305',
      category_id: CATEGORIES[1]!.id,
      name: 'Egg Roll',
      description: 'Flaky paratha wrapped around a spiced omelette with onions.',
      price_paise: 6500,
      is_vegetarian: false,
      is_featured: true,
      sort_order: 50,
    }),
    item({
      id: '5eed0000-0000-4000-b000-000000000401',
      category_id: CATEGORIES[2]!.id,
      name: 'Masala Chai',
      description: 'Strong tea brewed with milk, ginger and cardamom.',
      price_paise: 1500,
      is_featured: true,
    }),
  ];
}

const DEFAULT_HOURS = Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, { open: '08:00', close: '20:00', closed: false }]),
);

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

/** Unsigned JWT-shaped token; the mock trusts it, real Supabase verifies signatures. */
function token(claims: Record<string, unknown>): string {
  return `${base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${base64url(
    JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' }),
  )}.e2e`;
}

function claimsOf(request: { headers(): Record<string, string> }): Record<string, unknown> | null {
  const header = request.headers()['authorization'] ?? '';
  const raw = header.replace(/^Bearer\s+/i, '').split('.')[1];
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

let idCounter = 0;
const uuid = () => {
  idCounter += 1;
  return `00000000-0000-4000-9000-${String(idCounter).padStart(12, '0')}`;
};

export const ADMIN = { email: 'admin@canteen.test', password: 'correct-horse-battery', id: '00000000-0000-4000-9aaa-000000000001' };
export const UNPRIVILEGED = { email: 'visitor@canteen.test', password: 'just-a-normal-user', id: '00000000-0000-4000-9aaa-000000000002' };

export class MockBackend {
  menu = defaultMenu();
  orders: MockOrder[] = [];
  paymentsConfigured = true;
  orderingOpen = true;
  /** Calls made to server-only functions, for assertions. */
  calls: string[] = [];
  private sockets: { ws: WebSocketRoute; channels: Map<string, { joinRef: string; bindings: { id: number; table?: string }[] }> }[] = [];
  private orderCounter = 41;

  async install(page: Page) {
    await page.route(`${SUPABASE_URL}/**`, (route) => this.handle(route));
    await page.route('https://checkout.razorpay.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: RAZORPAY_STUB }),
    );
    // Third-party images are not needed for tests; keep the run offline and deterministic.
    await page.route('https://images.unsplash.com/**', (route) => route.abort());
    await page.routeWebSocket(/supabase\.e2e\.test\/realtime/, (ws) => this.handleSocket(ws));
  }

  // ---------------------------------------------------------------- helpers

  settings() {
    return {
      canteen_name: 'Campus Table',
      tagline: null,
      pickup_instructions: 'Show your order number at the pickup counter when your order is marked Ready.',
      opening_hours: DEFAULT_HOURS,
      timezone: 'Asia/Kolkata',
      student_id_mode: 'hidden',
      student_id_label: 'Student ID',
      max_items_per_order: 30,
      ordering_status: this.orderingOpen
        ? { is_open: true, reason: 'open', message: null, today_hours: DEFAULT_HOURS.mon, next_opening: null }
        : { is_open: false, reason: 'paused', message: 'Back in 15 minutes', today_hours: DEFAULT_HOURS.mon, next_opening: null },
    };
  }

  private priceLines(items: { menu_item_id: string; quantity: number; option_ids?: string[] | null; note?: string | null }[]) {
    const lines: Record<string, unknown>[] = [];
    const issues: Record<string, unknown>[] = [];
    items.forEach((line, index) => {
      const found = this.menu.find((candidate) => candidate.id === line.menu_item_id && candidate.is_active);
      if (!found) return issues.push({ index, menu_item_id: line.menu_item_id, code: 'not_found', name: null });
      if (!found.is_available) return issues.push({ index, menu_item_id: found.id, code: 'sold_out', name: found.name });
      const options = found.options.filter((option) => (line.option_ids ?? []).includes(option.id));
      const unit = found.price_paise + options.reduce((sum, option) => sum + option.price_delta_paise, 0);
      lines.push({
        index,
        menu_item_id: found.id,
        name: found.name,
        is_vegetarian: found.is_vegetarian,
        base_price_paise: found.price_paise,
        unit_price_paise: unit,
        quantity: line.quantity,
        line_total_paise: unit * line.quantity,
        options: options.map((option) => ({ id: option.id, name: option.name, price_delta_paise: option.price_delta_paise })),
        note: line.note ?? null,
      });
    });
    const total = lines.reduce((sum, line) => sum + (line.line_total_paise as number), 0);
    const count = lines.reduce((sum, line) => sum + (line.quantity as number), 0);
    return { lines, issues, subtotal_paise: total, total_paise: total, item_count: count };
  }

  receipt(order: MockOrder, isOwner: boolean) {
    return {
      order_id: order.id,
      order_number: order.order_number,
      status: order.status,
      payment_status: order.payment_status,
      customer_name: order.customer_name,
      student_identifier: order.student_identifier,
      created_at: order.created_at,
      paid_at: order.paid_at,
      payment_expires_at: order.payment_expires_at,
      subtotal_paise: order.subtotal_paise,
      total_paise: order.total_paise,
      currency: 'INR',
      amount_refunded_paise: 0,
      cancellation_reason: order.cancellation_reason,
      lines: order.lines.map((line) => ({
        name: line.item_name,
        quantity: line.quantity,
        unit_price_paise: line.unit_price_paise,
        line_total_paise: line.line_total_paise,
        is_vegetarian: line.is_vegetarian,
        customizations: line.customizations,
        note: line.special_instructions,
      })),
      payment: order.provider_payment_id
        ? { provider: 'razorpay', provider_payment_id: order.provider_payment_id, method: 'upi', verified_at: order.paid_at }
        : null,
      timeline: order.history.map((entry) => ({ status: entry.status, at: entry.at })),
      canteen: { name: 'Campus Table', pickup_instructions: this.settings().pickup_instructions },
      is_owner: isOwner,
      can_resume_payment: isOwner && order.status === 'payment_pending',
    };
  }

  adminRow(order: MockOrder) {
    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      payment_status: order.payment_status,
      customer_name: order.customer_name,
      student_identifier: order.student_identifier,
      total_paise: order.total_paise,
      item_count: order.item_count,
      created_at: order.created_at,
      paid_at: order.paid_at,
      accepted_at: order.accepted_at,
      preparing_at: order.preparing_at,
      ready_at: order.ready_at,
      completed_at: order.completed_at,
      cancelled_at: order.cancelled_at,
      cancellation_reason: order.cancellation_reason,
      payment_expires_at: order.payment_expires_at,
      order_items: order.lines,
      payments: {
        provider: 'razorpay',
        provider_order_id: order.provider_order_id,
        provider_payment_id: order.provider_payment_id,
        status: order.provider_payment_id ? 'captured' : 'created',
        method: 'upi',
        amount_paise: order.total_paise,
        amount_refunded_paise: 0,
        verified_at: order.paid_at,
        verification_source: order.paid_at ? 'checkout' : null,
        failure_reason: null,
      },
      refunds: [],
      order_status_history: order.history.map((entry, index) => ({
        id: index + 1,
        previous_status: index === 0 ? null : order.history[index - 1]!.status,
        new_status: entry.status,
        source: index === 0 ? 'system' : entry.status === 'confirmed' ? 'payment' : 'staff',
        note: null,
        created_at: entry.at,
        actor: null,
      })),
    };
  }

  /** Adds a paid order directly (as if another student just paid) and announces it over Realtime. */
  addPaidOrder(customerName = 'Kabir', lines = [{ menu_item_id: '5eed0000-0000-4000-b000-000000000401', quantity: 2 }]) {
    const order = this.createOrder('11111111-1111-4111-8111-111111111111', customerName, lines);
    this.markPaid(order);
    this.broadcastOrder(order);
    return order;
  }

  private createOrder(userId: string, customerName: string, items: { menu_item_id: string; quantity: number; option_ids?: string[]; note?: string | null }[]) {
    const priced = this.priceLines(items);
    const now = new Date().toISOString();
    this.orderCounter += 1;
    const order: MockOrder = {
      id: uuid(),
      order_number: `CT-20261010-${String(this.orderCounter).padStart(4, '0')}`,
      user_id: userId,
      customer_name: customerName,
      student_identifier: null,
      status: 'payment_pending',
      payment_status: 'pending',
      total_paise: priced.total_paise,
      subtotal_paise: priced.subtotal_paise,
      item_count: priced.item_count,
      created_at: now,
      paid_at: null,
      payment_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      accepted_at: null,
      preparing_at: null,
      ready_at: null,
      completed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      provider_order_id: `order_E2E${String(this.orderCounter).padStart(10, '0')}`,
      provider_payment_id: null,
      lines: priced.lines.map((line, index) => ({
        id: uuid(),
        line_number: index + 1,
        item_name: line.name as string,
        quantity: line.quantity as number,
        unit_price_paise: line.unit_price_paise as number,
        line_total_paise: line.line_total_paise as number,
        is_vegetarian: line.is_vegetarian as boolean,
        customizations: line.options as MockOrder['lines'][number]['customizations'],
        special_instructions: (line.note as string | null) ?? null,
      })),
      history: [{ status: 'payment_pending', at: now }],
    };
    this.orders.push(order);
    return order;
  }

  private markPaid(order: MockOrder) {
    const now = new Date().toISOString();
    order.status = 'confirmed';
    order.payment_status = 'paid';
    order.paid_at = now;
    order.provider_payment_id = `pay_E2E${order.order_number.slice(-4)}000000`;
    order.history.push({ status: 'confirmed', at: now });
  }

  // ------------------------------------------------------------- realtime

  private handleSocket(ws: WebSocketRoute) {
    const entry = { ws, channels: new Map<string, { joinRef: string; bindings: { id: number; table?: string }[] }>() };
    this.sockets.push(entry);
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as [string | null, string | null, string, string, Record<string, unknown>];
      const [joinRef, ref, topic, event, payload] = message;
      if (event === 'heartbeat') {
        ws.send(JSON.stringify([null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }]));
        return;
      }
      if (event === 'phx_join') {
        const config = (payload.config ?? {}) as { postgres_changes?: { event: string; schema: string; table?: string; filter?: string }[] };
        const bindings = (config.postgres_changes ?? []).map((binding, index) => ({ ...binding, id: 1000 + index }));
        entry.channels.set(topic, { joinRef: joinRef ?? '', bindings });
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: bindings } }]));
        return;
      }
      if (event === 'phx_leave') {
        entry.channels.delete(topic);
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
        return;
      }
      if (ref) ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
    });
  }

  broadcastOrder(order: MockOrder) {
    const record = this.adminRow(order) as Record<string, unknown>;
    delete record.order_items;
    delete record.payments;
    delete record.refunds;
    delete record.order_status_history;
    const columns = Object.keys(record).map((name) => ({ name, type: 'text' }));
    for (const { ws, channels } of this.sockets) {
      for (const [topic, channel] of channels) {
        const ids = channel.bindings.map((binding) => binding.id);
        if (ids.length === 0) continue;
        ws.send(
          JSON.stringify([
            channel.joinRef,
            null,
            topic,
            'postgres_changes',
            {
              ids,
              data: {
                type: 'UPDATE',
                schema: 'public',
                table: 'orders',
                commit_timestamp: new Date().toISOString(),
                record,
                old_record: { id: order.id },
                columns,
                errors: null,
              },
            },
          ]),
        );
      }
    }
  }

  // ----------------------------------------------------------------- HTTP

  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', ...headers },
        body: JSON.stringify(body),
      });

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        },
      });
    }

    const body = (() => {
      try {
        return request.postDataJSON() as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    })();
    const claims = claimsOf(request);

    // ---- Auth
    if (path === '/auth/v1/signup') {
      const id = uuid();
      return json(session({ sub: id, role: 'authenticated', is_anonymous: true }, { id, email: '', is_anonymous: true }));
    }
    if (path === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        const account = [ADMIN, UNPRIVILEGED].find((candidate) => candidate.email === body.email && candidate.password === body.password);
        if (!account) return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
        return json(session({ sub: account.id, role: 'authenticated', is_anonymous: false, email: account.email }, { id: account.id, email: account.email, is_anonymous: false }));
      }
      return json({ msg: 'unsupported' }, 400);
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (path === '/auth/v1/user') {
      return claims ? json({ id: claims.sub, email: claims.email ?? '', is_anonymous: claims.is_anonymous, aud: 'authenticated' }) : json({ msg: 'no' }, 401);
    }

    // ---- Edge Functions
    if (path === '/functions/v1/create-payment-order') {
      if (method === 'GET') {
        return json(this.paymentsConfigured ? { configured: true, mode: 'test', keyId: 'rzp_test_E2E' } : { configured: false, mode: null, keyId: null });
      }
      this.calls.push('create-payment-order');
      if (!this.paymentsConfigured) return json({ error: { code: 'PAYMENTS_NOT_CONFIGURED', message: 'Online payments are not configured yet.' } }, 503);
      if (!this.orderingOpen) return json({ error: { code: 'ORDERING_CLOSED', message: 'Back in 15 minutes' } }, 409);
      const userId = String(claims?.sub ?? '');
      const items = (body.items as { menuItemId: string; quantity: number; optionIds: string[]; note?: string }[]).map((line) => ({
        menu_item_id: line.menuItemId,
        quantity: line.quantity,
        option_ids: line.optionIds,
        note: line.note ?? null,
      }));
      const customer = body.customer as { name: string };
      const order = this.createOrder(userId, customer.name, items);
      return json({
        state: 'awaiting_payment',
        order: {
          id: order.id,
          orderNumber: order.order_number,
          status: order.status,
          paymentStatus: order.payment_status,
          totalPaise: order.total_paise,
          currency: 'INR',
          paymentExpiresAt: order.payment_expires_at,
        },
        payment: { provider: 'razorpay', keyId: 'rzp_test_E2E', mode: 'test', providerOrderId: order.provider_order_id, amountPaise: order.total_paise, currency: 'INR' },
        accessToken: 'e2e_receipt_token_abcdefghijklmnopqrstuvwxyz0123456789',
        replayed: false,
      });
    }
    if (path === '/functions/v1/verify-payment') {
      this.calls.push('verify-payment');
      const order = this.orders.find((candidate) => candidate.id === body.orderId);
      if (!order || order.provider_order_id !== body.razorpayOrderId) return json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } }, 404);
      this.markPaid(order);
      this.broadcastOrder(order);
      return json({ state: 'confirmed', order: { id: order.id, orderNumber: order.order_number, status: order.status, paymentStatus: order.payment_status } });
    }

    // ---- RPC
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.slice('/rest/v1/rpc/'.length);
      const isAdmin = claims?.sub === ADMIN.id;
      switch (fn) {
        case 'get_public_settings':
          return json(this.settings());
        case 'get_ordering_status':
          return json(this.settings().ordering_status);
        case 'quote_cart':
          return json({ ...this.priceLines(body.p_items as never), ordering_status: this.settings().ordering_status });
        case 'get_order_receipt': {
          const order = this.orders.find((candidate) => candidate.id === body.p_order_id);
          if (!order) return json(null);
          const owner = claims?.sub === order.user_id;
          if (!owner && !isAdmin && !body.p_access_token) return json(null);
          return json(this.receipt(order, owner));
        }
        case 'get_my_staff_role':
          return json(isAdmin ? 'admin' : null);
        case 'get_dashboard_stats': {
          const paid = this.orders.filter((order) => order.paid_at);
          return json({
            day: '2026-10-10',
            timezone: 'Asia/Kolkata',
            orders_today: paid.length,
            awaiting_preparation: paid.filter((order) => ['confirmed', 'accepted'].includes(order.status)).length,
            preparing: paid.filter((order) => order.status === 'preparing').length,
            ready_for_pickup: paid.filter((order) => order.status === 'ready').length,
            completed_today: paid.filter((order) => order.status === 'completed').length,
            cancelled_today: 0,
            gross_revenue_paise: paid.reduce((sum, order) => sum + order.total_paise, 0),
            refunded_paise: 0,
            net_revenue_paise: paid.reduce((sum, order) => sum + order.total_paise, 0),
            needs_attention: 0,
            recent_activity: [],
          });
        }
        case 'staff_update_order_status': {
          if (!isAdmin) return json({ code: '42501', message: 'FORBIDDEN', hint: 'Staff access is required.', details: null }, 403);
          const order = this.orders.find((candidate) => candidate.id === body.p_order_id);
          if (!order) return json({ code: 'P0001', message: 'ORDER_NOT_FOUND', hint: 'Order not found.', details: null }, 400);
          if (body.p_expected_status && order.status !== body.p_expected_status) {
            return json({ code: 'P0001', message: 'STALE_STATUS', hint: 'Updated elsewhere.', details: order.status }, 400);
          }
          order.status = body.p_new_status as OrderStatus;
          order.history.push({ status: order.status, at: new Date().toISOString() });
          this.broadcastOrder(order);
          return json({ result: 'updated', order_id: order.id, order_number: order.order_number, status: order.status, payment_status: order.payment_status, refund: null });
        }
        default:
          return json({ code: 'PGRST202', message: `Function ${fn} not mocked`, details: null, hint: null }, 404);
      }
    }

    // ---- Tables
    if (path === '/rest/v1/categories') return json(CATEGORIES);
    if (path === '/rest/v1/menu_items') return json(this.menu.filter((entry) => entry.is_active));
    if (path === '/rest/v1/profiles') {
      const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      const row = { display_name: claims?.sub === ADMIN.id ? 'Asha (Admin)' : null };
      return json(single ? row : [row]);
    }
    if (path === '/rest/v1/orders') {
      const isAdmin = claims?.sub === ADMIN.id;
      const select = url.searchParams.get('select') ?? '';
      if (!isAdmin) {
        const mine = this.orders.filter((order) => order.user_id === claims?.sub);
        return json(mine.map((order) => this.adminRow(order)));
      }
      let rows = [...this.orders];
      const statusIn = url.searchParams.get('status');
      if (statusIn?.startsWith('in.(')) {
        const allowed = statusIn.slice(4, -1).split(',');
        rows = rows.filter((order) => allowed.includes(order.status));
      } else if (statusIn?.startsWith('eq.')) {
        rows = rows.filter((order) => order.status === statusIn.slice(3));
      }
      const paymentIn = url.searchParams.get('payment_status');
      if (paymentIn?.startsWith('in.(')) {
        const allowed = paymentIn.slice(4, -1).split(',');
        rows = rows.filter((order) => allowed.includes(order.payment_status));
      }
      const idEq = url.searchParams.get('id');
      if (idEq?.startsWith('eq.')) rows = rows.filter((order) => order.id === idEq.slice(3));
      if (url.searchParams.get('or')) rows = []; // "needs attention" query: nothing in the mock
      const mapped = rows.map((order) => this.adminRow(order));
      if ((request.headers()['accept'] ?? '').includes('vnd.pgrst.object') || (select.includes('order_status_history') && idEq)) {
        return json(mapped[0] ?? null);
      }
      return json(mapped, 200, { 'content-range': `0-${Math.max(0, mapped.length - 1)}/${mapped.length}` });
    }

    return json({ message: `Not mocked: ${method} ${path}` }, 404);
  }
}

function session(claims: Record<string, unknown>, user: { id: string; email: string; is_anonymous: boolean }) {
  return {
    access_token: token(claims),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${user.id}`,
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      is_anonymous: user.is_anonymous,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

/**
 * Stand-in for Razorpay Checkout: "pays" immediately with clearly fake ids.
 * The mocked verify-payment endpoint plays the server's role; the real
 * signature and capture checks are covered by supabase/tests.
 */
const RAZORPAY_STUB = `
window.Razorpay = function (options) {
  this.options = options;
  this.on = function () {};
  this.open = function () {
    window.__razorpayOpened = options;
    setTimeout(function () {
      options.handler({
        razorpay_payment_id: 'pay_E2EFAKE00000001',
        razorpay_order_id: options.order_id,
        razorpay_signature: '${'a'.repeat(64)}'
      });
    }, 150);
  };
};
`;
