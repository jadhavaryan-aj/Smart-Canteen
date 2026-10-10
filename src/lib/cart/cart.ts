/**
 * Pure cart logic. Prices held in the cart are *display estimates* taken from
 * the menu; the server recalculates every amount from the database before an
 * order is created, so nothing here is trusted for payment.
 */
import { assertPaise } from '@/lib/money';
import type { CartRequestLine, MenuItem } from '@/types/domain';

export const MAX_QUANTITY_PER_LINE = 20;
export const MAX_CART_LINES = 30;
export const MAX_NOTE_LENGTH = 120;
export const DEFAULT_MAX_ITEMS_PER_ORDER = 30;

export interface CartLineOption {
  id: string;
  name: string;
  priceDeltaPaise: number;
}

export interface CartLine {
  lineId: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  isVegetarian: boolean;
  basePricePaise: number;
  options: CartLineOption[];
  note: string;
  quantity: number;
}

export interface CartState {
  version: 1;
  lines: CartLine[];
}

export type NewCartLine = Omit<CartLine, 'lineId' | 'quantity'>;

export type CartAction =
  | { type: 'add'; line: NewCartLine; quantity: number }
  | { type: 'setQuantity'; lineId: string; quantity: number }
  | { type: 'increment'; lineId: string }
  | { type: 'decrement'; lineId: string }
  | { type: 'remove'; lineId: string }
  | { type: 'replace'; lines: CartLine[] }
  | { type: 'clear' };

export const EMPTY_CART: CartState = { version: 1, lines: [] };

export function normalizeNote(note: string | undefined | null): string {
  return (note ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LENGTH);
}

/** A line is identified by item + chosen options + note, so different customisations stay separate. */
export function buildLineId(menuItemId: string, optionIds: readonly string[], note: string): string {
  const options = [...optionIds].sort().join(',');
  return `${menuItemId}|${options}|${normalizeNote(note).toLowerCase()}`;
}

export function isValidQuantity(quantity: unknown): quantity is number {
  return (
    typeof quantity === 'number' &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_QUANTITY_PER_LINE
  );
}

/** Clamps any input to a valid per-line quantity (1..MAX). Non-numbers become 1. */
export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_QUANTITY_PER_LINE, Math.max(1, Math.trunc(quantity)));
}

export function unitPricePaise(line: Pick<CartLine, 'basePricePaise' | 'options'>): number {
  const total = line.options.reduce((sum, option) => sum + option.priceDeltaPaise, line.basePricePaise);
  assertPaise(total);
  return total;
}

export function lineTotalPaise(line: Pick<CartLine, 'basePricePaise' | 'options' | 'quantity'>): number {
  return unitPricePaise(line) * line.quantity;
}

export interface CartTotals {
  subtotalPaise: number;
  itemCount: number;
  lineCount: number;
}

export function cartTotals(lines: readonly CartLine[]): CartTotals {
  let subtotalPaise = 0;
  let itemCount = 0;
  for (const line of lines) {
    subtotalPaise += lineTotalPaise(line);
    itemCount += line.quantity;
  }
  assertPaise(subtotalPaise);
  return { subtotalPaise, itemCount, lineCount: lines.length };
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const note = normalizeNote(action.line.note);
      const lineId = buildLineId(
        action.line.menuItemId,
        action.line.options.map((option) => option.id),
        note,
      );
      const existing = state.lines.find((line) => line.lineId === lineId);
      const quantity = clampQuantity(action.quantity);
      if (existing) {
        return {
          ...state,
          lines: state.lines.map((line) =>
            line.lineId === lineId
              ? { ...line, ...action.line, note, quantity: clampQuantity(line.quantity + quantity) }
              : line,
          ),
        };
      }
      if (state.lines.length >= MAX_CART_LINES) return state;
      return { ...state, lines: [...state.lines, { ...action.line, note, lineId, quantity }] };
    }
    case 'setQuantity': {
      if (!Number.isFinite(action.quantity)) return state;
      if (action.quantity < 1) {
        return { ...state, lines: state.lines.filter((line) => line.lineId !== action.lineId) };
      }
      const quantity = clampQuantity(action.quantity);
      return {
        ...state,
        lines: state.lines.map((line) => (line.lineId === action.lineId ? { ...line, quantity } : line)),
      };
    }
    case 'increment':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.lineId === action.lineId ? { ...line, quantity: clampQuantity(line.quantity + 1) } : line,
        ),
      };
    case 'decrement':
      return {
        ...state,
        lines: state.lines.flatMap((line) => {
          if (line.lineId !== action.lineId) return [line];
          return line.quantity <= 1 ? [] : [{ ...line, quantity: line.quantity - 1 }];
        }),
      };
    case 'remove':
      return { ...state, lines: state.lines.filter((line) => line.lineId !== action.lineId) };
    case 'replace':
      return { ...state, lines: action.lines.slice(0, MAX_CART_LINES) };
    case 'clear':
      return EMPTY_CART;
    default:
      return state;
  }
}

/** Converts cart lines into the minimal payload the server accepts (no prices). */
export function toRequestLines(lines: readonly CartLine[]): CartRequestLine[] {
  return lines.map((line) => {
    const request: CartRequestLine = {
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      optionIds: line.options.map((option) => option.id),
    };
    if (line.note) request.note = line.note;
    return request;
  });
}

export type CartChange =
  | { type: 'price_changed'; lineId: string; name: string; previousPaise: number; currentPaise: number }
  | { type: 'unavailable'; lineId: string; name: string }
  | { type: 'option_unavailable'; lineId: string; name: string };

/**
 * Re-syncs persisted cart lines with fresh menu data: refreshes names, images
 * and prices, and reports lines whose item or options are no longer orderable.
 * Unavailable lines are kept (so the student can see what changed) but flagged.
 */
export function reconcileCartWithMenu(
  lines: readonly CartLine[],
  items: readonly MenuItem[],
): { lines: CartLine[]; changes: CartChange[]; unavailableLineIds: Set<string> } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const changes: CartChange[] = [];
  const unavailableLineIds = new Set<string>();

  const next = lines.map((line) => {
    const item = byId.get(line.menuItemId);
    if (!item || !item.isActive || !item.isAvailable) {
      changes.push({ type: 'unavailable', lineId: line.lineId, name: line.name });
      unavailableLineIds.add(line.lineId);
      return line;
    }

    const options: CartLineOption[] = [];
    let optionProblem = false;
    for (const chosen of line.options) {
      const option = item.options.find((candidate) => candidate.id === chosen.id);
      if (!option || !option.isAvailable) {
        optionProblem = true;
        options.push(chosen);
      } else {
        options.push({ id: option.id, name: option.name, priceDeltaPaise: option.priceDeltaPaise });
      }
    }
    if (optionProblem) {
      changes.push({ type: 'option_unavailable', lineId: line.lineId, name: item.name });
      unavailableLineIds.add(line.lineId);
    }

    const updated: CartLine = {
      ...line,
      name: item.name,
      imageUrl: item.imageUrl,
      isVegetarian: item.isVegetarian,
      basePricePaise: item.pricePaise,
      options,
    };
    const previousPaise = unitPricePaise(line);
    const currentPaise = unitPricePaise(updated);
    if (!optionProblem && previousPaise !== currentPaise) {
      changes.push({ type: 'price_changed', lineId: line.lineId, name: item.name, previousPaise, currentPaise });
    }
    return updated;
  });

  return { lines: next, changes, unavailableLineIds };
}
