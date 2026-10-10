import { useState } from 'react';
import { toast } from 'sonner';

import { FoodImage } from '@/components/common/food-image';
import { VegIndicator } from '@/components/common/veg-indicator';
import { QuantityStepper } from '@/components/cart/quantity-stepper';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MAX_NOTE_LENGTH, MAX_QUANTITY_PER_LINE } from '@/lib/cart/cart';
import { cartStore } from '@/lib/cart/cart-store';
import { formatPaise } from '@/lib/money';
import type { MenuItem } from '@/types/domain';

interface CustomizeDialogProps {
  item: MenuItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}

export function CustomizeDialog({ item, open, onOpenChange, onAdded }: CustomizeDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);

  const chosen = item.options.filter((option) => selected.includes(option.id));
  const unitPaise = item.pricePaise + chosen.reduce((sum, option) => sum + option.priceDeltaPaise, 0);

  const reset = () => {
    setSelected([]);
    setNote('');
    setQuantity(1);
  };

  const add = () => {
    cartStore.dispatch({
      type: 'add',
      quantity,
      line: {
        menuItemId: item.id,
        name: item.name,
        imageUrl: item.imageUrl,
        isVegetarian: item.isVegetarian,
        basePricePaise: item.pricePaise,
        options: chosen.map((option) => ({ id: option.id, name: option.name, priceDeltaPaise: option.priceDeltaPaise })),
        note,
      },
    });
    toast.success(`${quantity} × ${item.name} added`, { description: 'Your tray has been updated.' });
    onOpenChange(false);
    reset();
    onAdded?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <FoodImage src={item.imageUrl} alt={item.name} className="aspect-[16/9] w-full" sizes="448px" />
        <div className="grid gap-5 p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <VegIndicator vegetarian={item.isVegetarian} />
              {item.name}
            </DialogTitle>
            <DialogDescription>{item.description}</DialogDescription>
          </DialogHeader>

          {item.options.length > 0 ? (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-semibold">Customise</legend>
              {item.options.map((option) => {
                const id = `option-${option.id}`;
                return (
                  <label
                    key={option.id}
                    htmlFor={id}
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3.5 transition-colors has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-secondary has-[:disabled]:opacity-50"
                  >
                    <Checkbox
                      id={id}
                      disabled={!option.isAvailable}
                      checked={selected.includes(option.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked ? [...current, option.id] : current.filter((value) => value !== option.id),
                        )
                      }
                    />
                    <span className="flex-1 text-sm font-medium">{option.name}</span>
                    <span className="tabular text-sm text-muted-foreground">
                      {!option.isAvailable
                        ? 'Unavailable'
                        : option.priceDeltaPaise > 0
                          ? `+${formatPaise(option.priceDeltaPaise)}`
                          : 'Free'}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={`note-${item.id}`}>
              Special instructions <span className="text-xs font-medium text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={`note-${item.id}`}
              value={note}
              maxLength={MAX_NOTE_LENGTH}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. less spicy, no onion"
              className="min-h-20"
            />
            <p className="text-right text-xs text-muted-foreground tabular">
              {note.length}/{MAX_NOTE_LENGTH}
            </p>
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <QuantityStepper
              value={quantity}
              label={item.name}
              onIncrement={() => setQuantity((value) => Math.min(MAX_QUANTITY_PER_LINE, value + 1))}
              onDecrement={() => setQuantity((value) => Math.max(1, value - 1))}
            />
            <Button size="lg" onClick={add} className="w-full sm:w-auto">
              Add {quantity} · {formatPaise(unitPaise * quantity)}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
