import { Link } from 'react-router';

import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

export function BrandMonogram({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 items-center justify-center rounded-[0.7rem] bg-primary font-display text-[1.05rem] text-primary-foreground italic shadow-soft',
        className,
      )}
    >
      {brand.monogram}
    </span>
  );
}

export function BrandMark({
  name = brand.name,
  to = '/',
  className,
}: {
  name?: string;
  to?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn('group flex items-center gap-2.5 rounded-xl focus-visible:outline-offset-4', className)}
      aria-label={`${name} — home`}
    >
      <BrandMonogram className="transition-transform duration-300 group-hover:-rotate-6" />
      <span className="font-display text-[1.3rem] leading-none font-medium tracking-tight">{name}</span>
    </Link>
  );
}
