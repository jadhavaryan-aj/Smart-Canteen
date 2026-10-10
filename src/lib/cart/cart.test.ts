import { describe, expect, it } from 'vitest';

import type { MenuItem } from '@/types/domain';

import {
  buildLineId,
  cartReducer,
  cartTotals,
  clampQuantity,
  EMPTY_CART,
  isValidQuantity,
  lineTotalPaise,
  MAX_CART_LINES,
  MAX_QUANTITY_PER_LINE,
  reconcileCartWithMenu,
  toRequestLines,
  type CartState,
  type NewCartLine,
} from './cart';

const DOSA = '5eed0000-0000-4000-b000-000000000101';
const CHAI = '5eed0000-0000-4000-b000-000000000401';
const BUTTER = '5eed0000-0000-4000-8000-000000000002';

const dosa: NewCartLine = {
  menuItemId: DOSA,
  name: 'Masala Dosa',
  imageUrl: null,
  isVegetarian: true,
  basePricePaise: 7000,
  options: [],
  note: '',
};
const chai: NewCartLine = { ...dosa, menuItemId: CHAI, name: 'Masala Chai', basePricePaise: 1500 };

function add(state: CartState, line: NewCartLine, quantity = 1) {
  return cartReducer(state, { type: 'add', line, quantity });
}

describe('cart totals', () => {
  it('sums line totals in integer paise', () => {
    let state = add(EMPTY_CART, dosa, 2);
    state = add(state, chai, 3);
    expect(cartTotals(state.lines)).toEqual({
      subtotalPaise: 2 * 7000 + 3 * 1500,
      itemCount: 5,
      lineCount: 2,
    });
  });

  it('includes option surcharges in the unit price', () => {
    const state = add(
      EMPTY_CART,
      { ...dosa, options: [{ id: BUTTER, name: 'Butter roast', priceDeltaPaise: 1000 }] },
      2,
    );
    expect(lineTotalPaise(state.lines[0]!)).toBe(16000);
    expect(cartTotals(state.lines).subtotalPaise).toBe(16000);
  });

  it('never produces fractional amounts', () => {
    let state = EMPTY_CART;
    for (let i = 0; i < 10; i++)
      state = add(
        state,
        { ...chai, menuItemId: `5eed0000-0000-4000-b000-00000000040${i}`, basePricePaise: 1999 },
        3,
      );
    const { subtotalPaise } = cartTotals(state.lines);
    expect(Number.isInteger(subtotalPaise)).toBe(true);
    expect(subtotalPaise).toBe(10 * 3 * 1999);
  });

  it('is zero for an empty cart', () => {
    expect(cartTotals([])).toEqual({ subtotalPaise: 0, itemCount: 0, lineCount: 0 });
  });
});

describe('quantity validation', () => {
  it.each([
    [1, true],
    [MAX_QUANTITY_PER_LINE, true],
    [0, false],
    [-1, false],
    [MAX_QUANTITY_PER_LINE + 1, false],
    [1.5, false],
    [Number.NaN, false],
    ['2', false],
  ])('isValidQuantity(%s) is %s', (value, expected) => {
    expect(isValidQuantity(value)).toBe(expected);
  });

  it('clamps quantities into the allowed range', () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-5)).toBe(1);
    expect(clampQuantity(2.9)).toBe(2);
    expect(clampQuantity(500)).toBe(MAX_QUANTITY_PER_LINE);
    expect(clampQuantity(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('caps repeated adds and increments at the per-line maximum', () => {
    let state = add(EMPTY_CART, chai, MAX_QUANTITY_PER_LINE);
    state = add(state, chai, 5);
    const lineId = state.lines[0]!.lineId;
    state = cartReducer(state, { type: 'increment', lineId });
    expect(state.lines[0]!.quantity).toBe(MAX_QUANTITY_PER_LINE);
  });

  it('removes a line when decremented below one or set to zero', () => {
    let state = add(EMPTY_CART, chai, 1);
    const lineId = state.lines[0]!.lineId;
    state = cartReducer(state, { type: 'decrement', lineId });
    expect(state.lines).toEqual([]);

    state = add(EMPTY_CART, chai, 3);
    state = cartReducer(state, { type: 'setQuantity', lineId, quantity: 0 });
    expect(state.lines).toEqual([]);
  });

  it('ignores non-finite quantity updates', () => {
    const state = add(EMPTY_CART, chai, 2);
    const next = cartReducer(state, {
      type: 'setQuantity',
      lineId: state.lines[0]!.lineId,
      quantity: Number.NaN,
    });
    expect(next).toBe(state);
  });

  it('limits the number of distinct lines', () => {
    let state = EMPTY_CART;
    for (let i = 0; i < MAX_CART_LINES + 5; i++) {
      state = add(state, { ...chai, note: `cup ${i}` });
    }
    expect(state.lines).toHaveLength(MAX_CART_LINES);
  });
});

describe('line identity', () => {
  it('merges identical items and keeps different customisations separate', () => {
    let state = add(EMPTY_CART, dosa);
    state = add(state, dosa);
    state = add(state, { ...dosa, note: 'less spicy' });
    state = add(state, { ...dosa, options: [{ id: BUTTER, name: 'Butter roast', priceDeltaPaise: 1000 }] });
    expect(state.lines.map((line) => line.quantity)).toEqual([2, 1, 1]);
  });

  it('treats option order and note whitespace/case as equivalent', () => {
    expect(buildLineId(DOSA, ['b', 'a'], '  Less   Spicy ')).toBe(
      buildLineId(DOSA, ['a', 'b'], 'less spicy'),
    );
  });
});

describe('server request payload', () => {
  it('never includes prices, names or images', () => {
    const state = add(
      EMPTY_CART,
      { ...dosa, note: 'no onion', options: [{ id: BUTTER, name: 'Butter roast', priceDeltaPaise: 1000 }] },
      2,
    );
    expect(toRequestLines(state.lines)).toEqual([
      { menuItemId: DOSA, quantity: 2, optionIds: [BUTTER], note: 'no onion' },
    ]);
  });
});

describe('reconciling the cart with the live menu', () => {
  const menuItem = (overrides: Partial<MenuItem> = {}): MenuItem => ({
    id: DOSA,
    categoryId: 'c',
    name: 'Masala Dosa',
    description: '',
    pricePaise: 7000,
    imageUrl: null,
    isVegetarian: true,
    isAvailable: true,
    isActive: true,
    isFeatured: false,
    sortOrder: 0,
    options: [
      {
        id: BUTTER,
        menuItemId: DOSA,
        name: 'Butter roast',
        priceDeltaPaise: 1000,
        isAvailable: true,
        sortOrder: 0,
      },
    ],
    ...overrides,
  });

  it('refreshes prices and reports the change', () => {
    const state = add(EMPTY_CART, dosa);
    const result = reconcileCartWithMenu(state.lines, [menuItem({ pricePaise: 7500 })]);
    expect(result.lines[0]!.basePricePaise).toBe(7500);
    expect(result.changes).toEqual([
      expect.objectContaining({ type: 'price_changed', previousPaise: 7000, currentPaise: 7500 }),
    ]);
  });

  it('flags sold-out, removed and archived items', () => {
    const state = add(add(EMPTY_CART, dosa), chai);
    const soldOut = reconcileCartWithMenu(state.lines, [menuItem({ isAvailable: false })]);
    expect(soldOut.unavailableLineIds.size).toBe(2); // dosa sold out, chai missing
    const archived = reconcileCartWithMenu(state.lines.slice(0, 1), [menuItem({ isActive: false })]);
    expect(archived.changes[0]?.type).toBe('unavailable');
  });

  it('flags lines whose chosen option became unavailable', () => {
    const state = add(EMPTY_CART, {
      ...dosa,
      options: [{ id: BUTTER, name: 'Butter roast', priceDeltaPaise: 1000 }],
    });
    const item = menuItem();
    item.options[0]!.isAvailable = false;
    const result = reconcileCartWithMenu(state.lines, [item]);
    expect(result.changes[0]?.type).toBe('option_unavailable');
    expect(result.unavailableLineIds.has(state.lines[0]!.lineId)).toBe(true);
  });
});
