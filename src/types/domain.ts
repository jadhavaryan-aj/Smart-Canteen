/** Domain types shared across the student app and the admin panel. */

export const ORDER_STATUSES = [
  'payment_pending',
  'confirmed',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refund_pending',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type AppRole = 'admin' | 'staff';
export type StudentIdMode = 'hidden' | 'optional' | 'required';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface OpeningHoursDay {
  open: string;
  close: string;
  closed: boolean;
}
export type OpeningHours = Record<DayKey, OpeningHoursDay>;

export type OrderingClosedReason =
  'open' | 'disabled' | 'paused' | 'closed_today' | 'before_opening' | 'after_closing';

export interface OrderingStatus {
  isOpen: boolean;
  reason: OrderingClosedReason;
  message: string | null;
  todayHours: OpeningHoursDay | null;
  nextOpening: { day: DayKey; date: string; time: string } | null;
}

export interface PublicSettings {
  canteenName: string;
  tagline: string | null;
  pickupInstructions: string | null;
  openingHours: OpeningHours;
  timezone: string;
  studentIdMode: StudentIdMode;
  studentIdLabel: string;
  maxItemsPerOrder: number;
  orderingStatus: OrderingStatus;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItemOption {
  id: string;
  menuItemId: string;
  name: string;
  priceDeltaPaise: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  pricePaise: number;
  imageUrl: string | null;
  isVegetarian: boolean;
  isAvailable: boolean;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  options: MenuItemOption[];
}

export interface MenuData {
  categories: Category[];
  items: MenuItem[];
}

/** Line sent to the server; the server derives every price from the database. */
export interface CartRequestLine {
  menuItemId: string;
  quantity: number;
  optionIds: string[];
  note?: string;
}

export type QuoteIssueCode = 'not_found' | 'sold_out' | 'option_unavailable';

export interface QuoteLine {
  index: number;
  menuItemId: string;
  name: string;
  isVegetarian: boolean;
  basePricePaise: number;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  options: { id: string; name: string; priceDeltaPaise: number }[];
  note: string | null;
}

export interface CartQuote {
  lines: QuoteLine[];
  subtotalPaise: number;
  totalPaise: number;
  itemCount: number;
  issues: { index: number; menuItemId: string; code: QuoteIssueCode; name: string | null }[];
  orderingStatus: OrderingStatus;
}

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  isVegetarian: boolean;
  customizations: { name: string; priceDeltaPaise: number }[];
  note: string | null;
}

export interface ReceiptTimelineEntry {
  status: OrderStatus;
  at: string;
}

export interface OrderReceipt {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerName: string;
  studentIdentifier: string | null;
  createdAt: string;
  paidAt: string | null;
  paymentExpiresAt: string;
  subtotalPaise: number;
  totalPaise: number;
  amountRefundedPaise: number;
  currency: 'INR';
  lines: ReceiptLine[];
  payment: {
    provider: 'razorpay';
    providerPaymentId: string | null;
    method: string | null;
    verifiedAt: string | null;
  } | null;
  timeline: ReceiptTimelineEntry[];
  canteen: { name: string; pickupInstructions: string | null };
  cancellationReason: string | null;
  isOwner: boolean;
  canResumePayment: boolean;
}

export interface MyOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalPaise: number;
  itemCount: number;
  createdAt: string;
  paidAt: string | null;
  paymentExpiresAt: string;
}
