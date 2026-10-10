import { describe, expect, it } from 'vitest';

import { EMPTY_CART } from './cart';
import { CART_STORAGE_KEY, loadCart, saveCart } from './cart-storage';

const validLine = {
  lineId: 'x|y|',
  menuItemId: '5eed0000-0000-4000-b000-000000000101',
  name: 'Masala Dosa',
  imageUrl: null,
  isVegetarian: true,
  basePricePaise: 7000,
  options: [],
  note: '',
  quantity: 2,
};

function storageWith(value: unknown) {
  return { getItem: (key: string) => (key === CART_STORAGE_KEY ? JSON.stringify(value) : null) };
}

describe('cart persistence', () => {
  it('round-trips a valid cart', () => {
    const store = new Map<string, string>();
    saveCart({ setItem: (key, value) => store.set(key, value) }, { version: 1, lines: [validLine] });
    const loaded = loadCart({ getItem: (key) => store.get(key) ?? null });
    expect(loaded.lines).toEqual([validLine]);
  });

  it.each([
    ['negative price', { ...validLine, basePricePaise: -100 }],
    ['fractional price', { ...validLine, basePricePaise: 10.5 }],
    ['excessive quantity', { ...validLine, quantity: 99 }],
    ['zero quantity', { ...validLine, quantity: 0 }],
    ['bad id', { ...validLine, menuItemId: "'; drop table" }],
    ['huge note', { ...validLine, note: 'x'.repeat(500) }],
  ])('discards a tampered cart (%s)', (_label, line) => {
    expect(loadCart(storageWith({ version: 1, lines: [line] }))).toEqual(EMPTY_CART);
  });

  it('discards corrupt JSON and unknown versions', () => {
    expect(loadCart({ getItem: () => '{not json' })).toEqual(EMPTY_CART);
    expect(loadCart(storageWith({ version: 2, lines: [] }))).toEqual(EMPTY_CART);
    expect(loadCart(undefined)).toEqual(EMPTY_CART);
  });

  it('survives storage that throws', () => {
    expect(() =>
      saveCart(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        EMPTY_CART,
      ),
    ).not.toThrow();
    expect(
      loadCart({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toEqual(EMPTY_CART);
  });
});
