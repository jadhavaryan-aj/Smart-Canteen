import { Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useCartDrawer } from '@/components/cart/cart-drawer-context';
import { QuantityStepper } from '@/components/cart/quantity-stepper';
import { Button } from '@/components/ui/button';
import { buildLineId } from '@/lib/cart/cart';
import { useCart } from '@/lib/cart/cart-store';
import type { MenuItem } from '@/types/domain';

import { CustomizeDialog } from './customize-dialog';

export function AddToCartControl({ item }: { item: MenuItem }) {
  const { lines, dispatch } = useCart();
  const { openCart } = useCartDrawer();
  const [customizing, setCustomizing] = useState(false);

  if (!item.isAvailable) {
    return (
      <Button size="sm" variant="subtle" disabled aria-label={`${item.name} is sold out`}>
        Sold out
      </Button>
    );
  }

  const hasOptions = item.options.some((option) => option.isAvailable);
  const plainLineId = buildLineId(item.id, [], '');
  const plainLine = lines.find((line) => line.lineId === plainLineId);

  if (hasOptions) {
    const inCart = lines
      .filter((line) => line.menuItemId === item.id)
      .reduce((sum, line) => sum + line.quantity, 0);
    return (
      <>
        <Button size="sm" variant={inCart > 0 ? 'secondary' : 'default'} onClick={() => setCustomizing(true)}>
          {inCart > 0 ? <SlidersHorizontal /> : <Plus />}
          {inCart > 0 ? `Add more (${inCart})` : 'Add'}
          <span className="sr-only"> {item.name}</span>
        </Button>
        <CustomizeDialog item={item} open={customizing} onOpenChange={setCustomizing} />
      </>
    );
  }

  if (plainLine) {
    return (
      <QuantityStepper
        size="sm"
        value={plainLine.quantity}
        label={item.name}
        showRemoveAtOne
        onIncrement={() => dispatch({ type: 'increment', lineId: plainLine.lineId })}
        onDecrement={() => dispatch({ type: 'decrement', lineId: plainLine.lineId })}
      />
    );
  }

  return (
    <Button
      size="sm"
      onClick={() => {
        dispatch({
          type: 'add',
          quantity: 1,
          line: {
            menuItemId: item.id,
            name: item.name,
            imageUrl: item.imageUrl,
            isVegetarian: item.isVegetarian,
            basePricePaise: item.pricePaise,
            options: [],
            note: '',
          },
        });
        toast.success(`${item.name} added`, { action: { label: 'View tray', onClick: openCart } });
      }}
    >
      <Plus /> Add<span className="sr-only"> {item.name} to cart</span>
    </Button>
  );
}
