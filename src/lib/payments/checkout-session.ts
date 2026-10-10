/**
 * Remembers the idempotency key for the current checkout in sessionStorage.
 * The same cart + details reuse the same key, so double taps, retries after
 * closing the payment window, and page refreshes return the *same* pending
 * order instead of creating duplicates. A changed cart gets a new key.
 */
const KEY = 'campus-table:checkout-session:v1';

interface CheckoutSession {
  fingerprint: string;
  idempotencyKey: string;
  orderId: string | null;
}

function read(): CheckoutSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CheckoutSession) : null;
  } catch {
    return null;
  }
}

function write(session: CheckoutSession | null) {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    // sessionStorage unavailable; keys simply won't survive a reload.
  }
}

export function idempotencyKeyFor(fingerprint: string): string {
  const current = read();
  if (current && current.fingerprint === fingerprint) return current.idempotencyKey;
  const next: CheckoutSession = { fingerprint, idempotencyKey: crypto.randomUUID(), orderId: null };
  write(next);
  return next.idempotencyKey;
}

export function rememberCheckoutOrder(orderId: string) {
  const current = read();
  if (current) write({ ...current, orderId });
}

export function checkoutOrderId(): string | null {
  return read()?.orderId ?? null;
}

/** Forget the key: after success, or when the server says the order can no longer be paid. */
export function resetCheckoutSession() {
  write(null);
}
