import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

import { FoodImage } from '@/components/common/food-image';
import { Price } from '@/components/common/price';
import { VegIndicator } from '@/components/common/veg-indicator';
import { cn } from '@/lib/utils';
import type { MenuItem } from '@/types/domain';

import { AddToCartControl } from './add-to-cart-control';

export function MenuItemCard({
  item,
  categoryName,
  index = 0,
  priority = false,
}: {
  item: MenuItem;
  categoryName?: string;
  index?: number;
  priority?: boolean;
}) {
  const soldOut = !item.isAvailable;
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 6) * 0.04 }}
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lift',
        soldOut && 'hover:translate-y-0 hover:shadow-soft',
      )}
      aria-label={item.name}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <FoodImage
          src={item.imageUrl}
          alt={item.name}
          hint={categoryName}
          priority={priority}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className={cn(
            'h-full w-full transition-transform duration-700 ease-out group-hover:scale-[1.04]',
            soldOut && 'grayscale-[60%]',
          )}
        />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="rounded-md bg-card/95 p-1 shadow-soft">
            <VegIndicator vegetarian={item.isVegetarian} />
          </span>
          {item.isFeatured && !soldOut ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-primary shadow-soft">
              <Sparkles className="size-3.5 text-honey" aria-hidden="true" /> Popular
            </span>
          ) : null}
        </div>
        {soldOut ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px]">
            <span className="rounded-full bg-foreground px-4 py-1.5 text-xs font-bold tracking-[0.12em] text-background uppercase">
              Sold out
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-[1.22rem] leading-snug font-medium">{item.name}</h3>
          <Price paise={item.pricePaise} className="font-display pt-0.5 text-lg font-medium text-primary" />
        </div>
        {item.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="text-xs font-medium text-muted-foreground">
            {item.options.length > 0 ? 'Customisable' : (categoryName ?? '')}
          </span>
          <AddToCartControl item={item} />
        </div>
      </div>
    </motion.article>
  );
}
