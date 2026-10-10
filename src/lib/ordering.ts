import { DAY_LABELS, formatClock, todayInZone } from '@/lib/dates';
import type { OrderingStatus } from '@/types/domain';

/** "Opens tomorrow at 8:00 AM." — or null when no opening is scheduled. */
export function nextOpeningText(status: OrderingStatus, timeZone: string): string | null {
  const next = status.nextOpening;
  if (!next) return null;
  const today = todayInZone(timeZone);
  const tomorrow = todayInZone(timeZone, new Date(Date.now() + 86_400_000));
  const when = next.date === today ? 'today' : next.date === tomorrow ? 'tomorrow' : `on ${DAY_LABELS[next.day]}`;
  return `Opens ${when} at ${formatClock(next.time)}.`;
}
