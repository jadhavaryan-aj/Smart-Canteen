/**
 * Stores each order's secret receipt token on this device so the student can
 * copy a receipt link that works on any device. Tokens are bearer secrets for
 * one receipt only; they are never sent anywhere except our own receipt RPC.
 */
const KEY = 'campus-table:receipt-tokens:v1';
const MAX_ENTRIES = 50;

type TokenMap = Record<string, { token: string; savedAt: number }>;

function read(): TokenMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as TokenMap) : {};
  } catch {
    return {};
  }
}

export function saveReceiptToken(orderId: string, token: string): void {
  try {
    const entries = Object.entries({ ...read(), [orderId]: { token, savedAt: Date.now() } })
      .sort(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage unavailable: the receipt is still accessible while signed in.
  }
}

export function getReceiptToken(orderId: string): string | null {
  return read()[orderId]?.token ?? null;
}

export function receiptUrl(orderId: string, token: string | null): string {
  const url = new URL(`/orders/${orderId}`, window.location.origin);
  if (token) url.hash = `t=${token}`;
  return url.toString();
}
