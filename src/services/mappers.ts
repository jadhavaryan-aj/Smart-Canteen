/** Converts snake_case database payloads into domain types. */
import type { Tables } from '@/lib/supabase/database.types';
import type {
  CartQuote,
  Category,
  DayKey,
  MenuItem,
  MenuItemOption,
  MyOrderSummary,
  OpeningHours,
  OrderingStatus,
  OrderReceipt,
  PublicSettings,
} from '@/types/domain';

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw => (value && typeof value === 'object' ? (value as Raw) : {});
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0));

export function mapCategory(row: Tables<'categories'>): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export function mapOption(row: Tables<'menu_item_options'>): MenuItemOption {
  return {
    id: row.id,
    menuItemId: row.menu_item_id,
    name: row.name,
    priceDeltaPaise: row.price_delta_paise,
    isAvailable: row.is_available,
    sortOrder: row.sort_order,
  };
}

export function mapMenuItem(
  row: Tables<'menu_items'> & { options?: Tables<'menu_item_options'>[] | null },
): MenuItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    pricePaise: row.price_paise,
    imageUrl: row.image_url,
    isVegetarian: row.is_vegetarian,
    isAvailable: row.is_available,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    sortOrder: row.sort_order,
    options: (row.options ?? [])
      .map(mapOption)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  };
}

export function mapOrderingStatus(raw: unknown): OrderingStatus {
  const value = asRecord(raw);
  const today = value.today_hours ? asRecord(value.today_hours) : null;
  const next = value.next_opening ? asRecord(value.next_opening) : null;
  return {
    isOpen: value.is_open === true,
    reason: (str(value.reason) || 'disabled') as OrderingStatus['reason'],
    message: strOrNull(value.message),
    todayHours: today
      ? { open: str(today.open), close: str(today.close), closed: today.closed === true }
      : null,
    nextOpening: next ? { day: str(next.day) as DayKey, date: str(next.date), time: str(next.time) } : null,
  };
}

export function mapPublicSettings(raw: unknown): PublicSettings {
  const value = asRecord(raw);
  return {
    canteenName: str(value.canteen_name) || 'Campus Table',
    tagline: strOrNull(value.tagline),
    pickupInstructions: strOrNull(value.pickup_instructions),
    openingHours: value.opening_hours as OpeningHours,
    timezone: str(value.timezone) || 'Asia/Kolkata',
    studentIdMode: (str(value.student_id_mode) || 'hidden') as PublicSettings['studentIdMode'],
    studentIdLabel: str(value.student_id_label) || 'Student ID',
    maxItemsPerOrder: num(value.max_items_per_order) || 30,
    orderingStatus: mapOrderingStatus(value.ordering_status),
  };
}

export function mapQuote(raw: unknown): CartQuote {
  const value = asRecord(raw);
  const lines = Array.isArray(value.lines) ? value.lines.map(asRecord) : [];
  const issues = Array.isArray(value.issues) ? value.issues.map(asRecord) : [];
  return {
    lines: lines.map((line) => ({
      index: num(line.index),
      menuItemId: str(line.menu_item_id),
      name: str(line.name),
      isVegetarian: line.is_vegetarian === true,
      basePricePaise: num(line.base_price_paise),
      unitPricePaise: num(line.unit_price_paise),
      quantity: num(line.quantity),
      lineTotalPaise: num(line.line_total_paise),
      options: (Array.isArray(line.options) ? line.options.map(asRecord) : []).map((option) => ({
        id: str(option.id),
        name: str(option.name),
        priceDeltaPaise: num(option.price_delta_paise),
      })),
      note: strOrNull(line.note),
    })),
    subtotalPaise: num(value.subtotal_paise),
    totalPaise: num(value.total_paise),
    itemCount: num(value.item_count),
    issues: issues.map((issue) => ({
      index: num(issue.index),
      menuItemId: str(issue.menu_item_id),
      code: str(issue.code) as CartQuote['issues'][number]['code'],
      name: strOrNull(issue.name),
    })),
    orderingStatus: mapOrderingStatus(value.ordering_status),
  };
}

export function mapReceipt(raw: unknown): OrderReceipt {
  const value = asRecord(raw);
  const payment = value.payment ? asRecord(value.payment) : null;
  const canteen = asRecord(value.canteen);
  return {
    orderId: str(value.order_id),
    orderNumber: str(value.order_number),
    status: str(value.status) as OrderReceipt['status'],
    paymentStatus: str(value.payment_status) as OrderReceipt['paymentStatus'],
    customerName: str(value.customer_name),
    studentIdentifier: strOrNull(value.student_identifier),
    createdAt: str(value.created_at),
    paidAt: strOrNull(value.paid_at),
    paymentExpiresAt: str(value.payment_expires_at),
    subtotalPaise: num(value.subtotal_paise),
    totalPaise: num(value.total_paise),
    amountRefundedPaise: num(value.amount_refunded_paise),
    currency: 'INR',
    lines: (Array.isArray(value.lines) ? value.lines.map(asRecord) : []).map((line) => ({
      name: str(line.name),
      quantity: num(line.quantity),
      unitPricePaise: num(line.unit_price_paise),
      lineTotalPaise: num(line.line_total_paise),
      isVegetarian: line.is_vegetarian === true,
      customizations: (Array.isArray(line.customizations) ? line.customizations.map(asRecord) : []).map(
        (c) => ({
          name: str(c.name),
          priceDeltaPaise: num(c.price_delta_paise),
        }),
      ),
      note: strOrNull(line.note),
    })),
    payment: payment
      ? {
          provider: 'razorpay',
          providerPaymentId: strOrNull(payment.provider_payment_id),
          method: strOrNull(payment.method),
          verifiedAt: strOrNull(payment.verified_at),
        }
      : null,
    timeline: (Array.isArray(value.timeline) ? value.timeline.map(asRecord) : []).map((entry) => ({
      status: str(entry.status) as OrderReceipt['status'],
      at: str(entry.at),
    })),
    canteen: {
      name: str(canteen.name) || 'Campus Table',
      pickupInstructions: strOrNull(canteen.pickup_instructions),
    },
    cancellationReason: strOrNull(value.cancellation_reason),
    isOwner: value.is_owner === true,
    canResumePayment: value.can_resume_payment === true,
  };
}

export function mapMyOrder(
  row: Pick<
    Tables<'orders'>,
    | 'id'
    | 'order_number'
    | 'status'
    | 'payment_status'
    | 'total_paise'
    | 'item_count'
    | 'created_at'
    | 'paid_at'
    | 'payment_expires_at'
  >,
): MyOrderSummary {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    totalPaise: row.total_paise,
    itemCount: row.item_count,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    paymentExpiresAt: row.payment_expires_at,
  };
}
