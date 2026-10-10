/** Per-device admin preferences (not security relevant). */
const PREFIX = 'campus-table:admin:';

export function readPreference(name: 'sound' | 'desktop-notifications', fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(PREFIX + name);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

export function writePreference(name: 'sound' | 'desktop-notifications', value: boolean): void {
  try {
    localStorage.setItem(PREFIX + name, value ? '1' : '0');
  } catch {
    // ignore
  }
}
