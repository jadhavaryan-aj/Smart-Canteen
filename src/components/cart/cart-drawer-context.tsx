import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface CartDrawerState {
  open: boolean;
  setOpen: (open: boolean) => void;
  openCart: () => void;
}

const CartDrawerContext = createContext<CartDrawerState | null>(null);

export function CartDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen, openCart: () => setOpen(true) }), [open]);
  return <CartDrawerContext.Provider value={value}>{children}</CartDrawerContext.Provider>;
}

export function useCartDrawer(): CartDrawerState {
  const value = useContext(CartDrawerContext);
  if (!value) throw new Error('useCartDrawer must be used inside CartDrawerProvider');
  return value;
}
