import { formatClock, DAY_LABELS, todayInZone } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { DAY_KEYS, type OpeningHours } from '@/types/domain';

function todayKey(timeZone: string): string {
  const date = new Date(`${todayInZone(timeZone)}T12:00:00Z`);
  return DAY_KEYS[(date.getUTCDay() + 6) % 7] ?? 'mon';
}

export function OpeningHoursTable({
  hours,
  timeZone,
  className,
}: {
  hours: OpeningHours;
  timeZone: string;
  className?: string;
}) {
  const today = todayKey(timeZone);
  return (
    <dl className={cn('divide-y divide-border', className)}>
      {DAY_KEYS.map((day) => {
        const entry = hours[day];
        const isToday = day === today;
        return (
          <div
            key={day}
            className={cn(
              'flex items-center justify-between py-2.5 text-sm',
              isToday && 'font-semibold text-primary',
            )}
          >
            <dt className="flex items-center gap-2">
              {DAY_LABELS[day]}
              {isToday ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.68rem] font-bold tracking-wide uppercase">
                  Today
                </span>
              ) : null}
            </dt>
            <dd className={cn('tabular', entry.closed && 'text-muted-foreground')}>
              {entry.closed ? 'Closed' : `${formatClock(entry.open)} – ${formatClock(entry.close)}`}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
