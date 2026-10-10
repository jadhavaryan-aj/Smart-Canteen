import { useEffect, useMemo, useRef } from 'react';

import { reconcileCartWithMenu, type CartChange } from '@/lib/cart/cart';
import { useCart } from '@/lib/cart/cart-store';

import { useMenu } from './use-menu';

/**
 * Keeps the persisted cart in step with the live menu: refreshes names and
 * prices and flags lines that can no longer be ordered.
 */
export function useCartSync(): {
  changes: CartChange[];
  unavailableLineIds: Set<string>;
  menuLoaded: boolean;
} {
  const { lines, dispatch } = useCart();
  const menu = useMenu();
  const lastApplied = useRef<string>('');

  const result = useMemo(() => {
    if (!menu.data) return null;
    return reconcileCartWithMenu(lines, menu.data.items);
  }, [lines, menu.data]);

  useEffect(() => {
    if (!result) return;
    const next = JSON.stringify(result.lines);
    if (next !== JSON.stringify(lines) && next !== lastApplied.current) {
      lastApplied.current = next;
      dispatch({ type: 'replace', lines: result.lines });
    }
  }, [result, lines, dispatch]);

  return {
    changes: result?.changes ?? [],
    unavailableLineIds: result?.unavailableLineIds ?? new Set(),
    menuLoaded: Boolean(menu.data),
  };
}
