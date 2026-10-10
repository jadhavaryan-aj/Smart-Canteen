/** Request schemas for the Edge Functions. Prices are never accepted from clients. */
import { z } from 'zod';

// z.guid() accepts any canonical 8-4-4-4-12 hex id, matching Postgres' uuid type.
const uuid = z.guid({ error: 'Invalid identifier.' });

export const cartLineSchema = z
  .object({
    menuItemId: uuid,
    quantity: z.number().int().min(1).max(20),
    optionIds: z.array(uuid).max(10).default([]),
    note: z.string().max(120).optional(),
  })
  .strict();

export const createOrderSchema = z
  .object({
    action: z.literal('create'),
    idempotencyKey: uuid,
    items: z.array(cartLineSchema).min(1).max(30),
    customer: z
      .object({
        name: z.string().trim().min(2).max(40),
        studentIdentifier: z.string().trim().max(40).optional(),
      })
      .strict(),
    acceptTerms: z.literal(true, { error: 'Please accept the ordering terms.' }),
  })
  .strict();

export const resumeOrderSchema = z
  .object({
    action: z.literal('resume'),
    orderId: uuid,
  })
  .strict();

export const paymentOrderRequestSchema = z.discriminatedUnion('action', [
  createOrderSchema,
  resumeOrderSchema,
]);

export const verifyPaymentSchema = z
  .object({
    orderId: uuid,
    razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
    razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
    razorpaySignature: z.string().regex(/^[a-fA-F0-9]{64}$/),
  })
  .strict();

export const staffStatuses = ['accepted', 'preparing', 'ready', 'completed', 'cancelled'] as const;
const orderStatuses = ['payment_pending', 'confirmed', ...staffStatuses] as const;

export const updateOrderStatusSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('set_status'),
      orderId: uuid,
      status: z.enum(staffStatuses),
      expectedStatus: z.enum(orderStatuses).optional(),
      note: z.string().trim().max(300).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('refund'),
      orderId: uuid,
    })
    .strict(),
]);

export function formatZodError(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}
