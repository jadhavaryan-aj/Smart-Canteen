import {
  CakeSlice,
  ChefHat,
  Coffee,
  CookingPot,
  CupSoda,
  EggFried,
  Popcorn,
  Sandwich,
  Soup,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';

import { cn } from '@/lib/utils';

const ICON_RULES: [RegExp, LucideIcon][] = [
  [/coffee|chai|tea|latte/i, Coffee],
  [/soda|lassi|juice|shake|lime|cooler/i, CupSoda],
  [/sandwich|burger|pav|roll|wrap/i, Sandwich],
  [/fries|chips|samosa|pakora/i, Popcorn],
  [/brownie|cake|sweet|dessert|kheer|halwa/i, CakeSlice],
  [/egg|omelette/i, EggFried],
  [/biryani|rice|thali|chawal|pulao|meal/i, CookingPot],
  [/dosa|idli|sambar|soup|dal|poha|upma/i, Soup],
  [/special|chef/i, ChefHat],
];

const TINTS = [
  'from-sage-soft to-[#eef2e9] text-primary/70',
  'from-honey-soft to-[#fbf4e6] text-honey/80',
  'from-[#efe9de] to-muted text-[#7a6a52]',
];

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

interface FoodImageProps {
  src: string | null;
  alt: string;
  className?: string;
  /** Used to choose the placeholder icon when there is no photo. */
  hint?: string;
  sizes?: string;
  priority?: boolean;
}

/** Food photography with a designed, on-brand placeholder when no photo exists or it fails to load. */
export function FoodImage({ src, alt, className, hint, sizes, priority = false }: FoodImageProps) {
  const [failed, setFailed] = useState(false);
  const patternId = `food-dots-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  if (!src || failed) {
    const text = `${alt} ${hint ?? ''}`;
    const Icon = ICON_RULES.find(([pattern]) => pattern.test(text))?.[1] ?? UtensilsCrossed;
    const tint = TINTS[hash(alt) % TINTS.length];
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          'relative flex items-center justify-center overflow-hidden bg-gradient-to-br',
          tint,
          className,
        )}
      >
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-[0.18]">
          <defs>
            <pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        </svg>
        <span className="relative flex size-16 items-center justify-center rounded-full bg-card/70 shadow-soft backdrop-blur-sm">
          <Icon className="size-7" strokeWidth={1.6} />
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  );
}
