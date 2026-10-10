import {
  EMPTY_CART,
  MAX_CART_LINES,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY_PER_LINE,
  type CartLine,
  type CartState,
} from './cart';

export const CART_STORAGE_KEY = 'campus-table:cart:v1';

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isPaise = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isString = (value: unknown, max: number, min = 0): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;

function isCartLine(value: unknown): value is CartLine {
  if (!isRecord(value)) return false;
  return (
    isString(value.lineId, 600, 1) &&
    isString(value.menuItemId, 36, 36) &&
    ID_PATTERN.test(value.menuItemId) &&
    isString(value.name, 120, 1) &&
    (value.imageUrl === null || isString(value.imageUrl, 1024)) &&
    typeof value.isVegetarian === 'boolean' &&
    isPaise(value.basePricePaise) &&
    Array.isArray(value.options) &&
    value.options.length <= 10 &&
    value.options.every(
      (option) =>
        isRecord(option) &&
        isString(option.id, 36, 36) &&
        ID_PATTERN.test(option.id) &&
        isString(option.name, 120) &&
        isPaise(option.priceDeltaPaise),
    ) &&
    isString(value.note, MAX_NOTE_LENGTH) &&
    Number.isInteger(value.quantity) &&
    (value.quantity as number) >= 1 &&
    (value.quantity as number) <= MAX_QUANTITY_PER_LINE
  );
}

/** Reads the cart from localStorage. Corrupt or tampered data is discarded. */
export function loadCart(storage: Pick<Storage, 'getItem'> | undefined): CartState {
  if (!storage) return EMPTY_CART;
  try {
    const raw = storage.getItem(CART_STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.lines) ||
      parsed.lines.length > MAX_CART_LINES ||
      !parsed.lines.every(isCartLine)
    ) {
      return EMPTY_CART;
    }
    return { version: 1, lines: parsed.lines as CartLine[] };
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
