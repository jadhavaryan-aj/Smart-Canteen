import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { CartDrawerProvider } from '@/components/cart/cart-drawer-context';
import { QuantityStepper } from '@/components/cart/quantity-stepper';
import { cartStore } from '@/lib/cart/cart-store';
import { MAX_QUANTITY_PER_LINE } from '@/lib/cart/cart';
import type { MenuItem } from '@/types/domain';

import { MenuItemCard } from './menu-item-card';

const chai: MenuItem = {
  id: '5eed0000-0000-4000-b000-000000000401',
  categoryId: 'c',
  name: 'Masala Chai',
  description: 'Strong tea',
  pricePaise: 1500,
  imageUrl: null,
  isVegetarian: true,
  isAvailable: true,
  isActive: true,
  isFeatured: false,
  sortOrder: 0,
  options: [],
};

function renderCard(item: MenuItem) {
  return render(
    <MemoryRouter>
      <CartDrawerProvider>
        <MenuItemCard item={item} />
      </CartDrawerProvider>
    </MemoryRouter>,
  );
}

describe('menu item card', () => {
  it('cannot add a sold-out item', () => {
    renderCard({ ...chai, isAvailable: false });
    expect(screen.getByRole('button', { name: /sold out/i })).toBeDisabled();
    expect(screen.getByText('Sold out', { selector: 'span' })).toBeInTheDocument();
  });

  it('adds an item and then shows a quantity stepper', async () => {
    cartStore.dispatch({ type: 'clear' });
    renderCard(chai);
    await userEvent.click(screen.getByRole('button', { name: /Add Masala Chai to cart/ }));
    expect(cartStore.getSnapshot().lines).toEqual([
      expect.objectContaining({ menuItemId: chai.id, quantity: 1 }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity of Masala Chai' }));
    expect(cartStore.getSnapshot().lines[0]?.quantity).toBe(2);
    cartStore.dispatch({ type: 'clear' });
  });

  it('labels the vegetarian mark for screen readers', () => {
    renderCard(chai);
    expect(screen.getAllByRole('img', { name: 'Vegetarian' }).length).toBeGreaterThan(0);
  });
});

describe('quantity stepper', () => {
  it('disables increasing beyond the maximum', () => {
    render(
      <QuantityStepper
        value={MAX_QUANTITY_PER_LINE}
        label="Chai"
        onIncrement={() => {}}
        onDecrement={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Increase quantity of Chai' })).toBeDisabled();
  });
});
