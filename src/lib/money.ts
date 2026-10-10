/**
 * Money helpers. All amounts are integer paise (1 rupee = 100 paise).
 * Never use floating point for arithmetic on money.
 */

const formatterWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formatterFraction = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function assertPaise(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Expected an integer number of paise, received ${value}`);
  }
}

/** Formats paise as rupees, e.g. 12000 → "₹120", 12050 → "₹120.50". */
export function formatPaise(paise: number): string {
  assertPaise(paise);
  const rupees = paise / 100; // display only
  return paise % 100 === 0 ? formatterWhole.format(rupees) : formatterFraction.format(rupees);
}

/** Converts paise to a plain rupee string for form inputs, e.g. 12050 → "120.50". */
export function paiseToRupeeInput(paise: number): string {
  assertPaise(paise);
  const whole = Math.trunc(paise / 100);
  const fraction = Math.abs(paise % 100);
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * Parses a rupee amount typed by a person ("120", "120.5", "120.50") into
 * integer paise using string arithmetic only. Returns null for invalid input.
 */
export function parseRupeesToPaise(input: string): number | null {
  const trimmed = input.trim();
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0') || '0');
  const paise = whole * 100 + fraction;
  return Number.isSafeInteger(paise) ? paise : null;
}

export function sumPaise(values: readonly number[]): number {
  return values.reduce((total, value) => {
    assertPaise(value);
    return total + value;
  }, 0);
}
