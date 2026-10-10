import { cn } from '@/lib/utils';

/**
 * Indian food-safety (FSSAI) style marks: a green square with a dot for
 * vegetarian, a brown square with a triangle for non-vegetarian.
 */
export function VegIndicator({ vegetarian, className }: { vegetarian: boolean; className?: string }) {
  const label = vegetarian ? 'Vegetarian' : 'Non-vegetarian';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-[1.05rem] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-card',
        vegetarian ? 'border-veg' : 'border-nonveg',
        className,
      )}
    >
      {vegetarian ? (
        <span className="size-[0.45rem] rounded-full bg-veg" />
      ) : (
        <span className="h-0 w-0 border-x-[0.28rem] border-b-[0.48rem] border-x-transparent border-b-nonveg" />
      )}
    </span>
  );
}
