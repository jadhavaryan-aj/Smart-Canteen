import { useSyncExternalStore } from 'react';

import { cartReducer, cartTotals, EMPTY_CART, type CartAction, type CartState } from './cart';
import { CART_STORAGE_KEY, loadCart, saveCart } from './cart-storage';

type Listener = () => void;

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** A tiny external store: persisted to localStorage and synced across tabs. */
class CartStore {
  private state: CartState = EMPTY_CART;
  private listeners = new Set<Listener>();
  private initialised = false;

  private init() {
    if (this.initialised) return;
    this.initialised = true;
    this.state = loadCart(safeLocalStorage());
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key !== CART_STORAGE_KEY) return;
        this.state = loadCart(safeLocalStorage());
        this.emit();
      });
    }
  }

  getSnapshot = (): CartState => {
    this.init();
    return this.state;
  };

  subscribe = (listener: Listener): (() => void) => {
    this.init();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch = (action: CartAction): void => {
    this.init();
    const next = cartReducer(this.state, action);
    if (next === this.state) return;
    this.state = next;
    saveCart(safeLocalStorage(), next);
    this.emit();
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export const cartStore = new CartStore();

export function useCart() {
  const state = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, () => EMPTY_CART);
  return { lines: state.lines, totals: cartTotals(state.lines), dispatch: cartStore.dispatch };
}
