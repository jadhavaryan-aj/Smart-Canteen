import { z } from 'zod';

import { EMPTY_CART, MAX_CART_LINES, MAX_NOTE_LENGTH, MAX_QUANTITY_PER_LINE, type CartState } from './cart';

export const CART_STORAGE_KEY = 'campus-table:cart:v1';

const lineSchema = z.object({
  lineId: z.string().min(1).max(600),
  menuItemId: z.guid(),
  name: z.string().min(1).max(120),
  imageUrl: z.string().max(1024).nullable(),
  isVegetarian: z.boolean(),
  basePricePaise: z.number().int().nonnegative(),
  options: z
    .array(z.object({ id: z.guid(), name: z.string().max(120), priceDeltaPaise: z.number().int().nonnegative() }))
    .max(10),
  note: z.string().max(MAX_NOTE_LENGTH),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
});

const cartSchema = z.object({
  version: z.literal(1),
  lines: z.array(lineSchema).max(MAX_CART_LINES),
});

/** Reads the cart from localStorage. Corrupt or tampered data is discarded. */
export function loadCart(storage: Pick<Storage, 'getItem'> | undefined): CartState {
  if (!storage) return EMPTY_CART;
  try {
    const raw = storage.getItem(CART_STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    const parsed = cartSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_CART;
  } catch {
    return EMPTY_CART;
  }
}

export function saveCart(storage: Pick<Storage, 'setItem'> | undefined, state: CartState): void {
  if (!storage) return;
  try {
    storage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or blocked (private mode); the in-memory cart still works.
  }
}
