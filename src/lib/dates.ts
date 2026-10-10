/** Date helpers. Display times in the canteen's time zone (default Asia/Kolkata). */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export function formatDateTime(iso: string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

export function formatTime(iso: string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone }).format(
    new Date(iso),
  );
}

export function formatDate(iso: string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
}

/** "08:00" → "8:00 AM" (opening hours are stored as local HH:MM). */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/** Compact relative time for the kitchen queue: "just now", "4 min", "1 h 12 min". */
export function formatElapsed(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayInZone(timeZone = DEFAULT_TIMEZONE, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export const DAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
