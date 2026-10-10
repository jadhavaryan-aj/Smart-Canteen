/**
 * Browser-side Razorpay Checkout. It only ever receives the *public* key id
 * and a Razorpay order id created by our server. Its success callback is just
 * a claim that is verified server-side (verify-payment); nothing here marks an
 * order as paid.
 */
const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayFailure {
  error?: { code?: string; description?: string; reason?: string };
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: 'INR';
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  retry?: { enabled: boolean; max_count?: number };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', callback: (response: RazorpayFailure) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

export function loadRazorpayScript(timeoutMs = 15_000): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay requires a browser'));
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    const timer = window.setTimeout(() => {
      loading = null;
      reject(new Error('Timed out loading Razorpay Checkout'));
    }, timeoutMs);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Razorpay) resolve();
      else {
        loading = null;
        reject(new Error('Razorpay Checkout did not initialise'));
      }
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      loading = null;
      script.remove();
      reject(new Error('Could not load Razorpay Checkout (blocked or offline)'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type CheckoutOutcome = { type: 'success'; response: RazorpaySuccessResponse } | { type: 'dismissed' };

/**
 * Opens Razorpay Checkout and resolves when the student completes or closes
 * it. Failed attempts inside the modal are reported through `onAttemptFailed`
 * (the student may retry within the same window).
 */
export async function openRazorpayCheckout(input: {
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  canteenName: string;
  orderNumber: string;
  customerName: string;
  onAttemptFailed?: (message: string) => void;
}): Promise<CheckoutOutcome> {
  await loadRazorpayScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Razorpay Checkout is unavailable');

  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const instance = new Razorpay({
      key: input.keyId,
      amount: input.amountPaise,
      currency: 'INR',
      name: input.canteenName,
      description: `Order ${input.orderNumber}`,
      order_id: input.providerOrderId,
      prefill: { name: input.customerName },
      notes: { order_number: input.orderNumber },
      theme: { color: '#1f3d2b' },
      retry: { enabled: true, max_count: 3 },
      handler: (response) => settle({ type: 'success', response }),
      modal: { ondismiss: () => settle({ type: 'dismissed' }), escape: true, confirm_close: true },
    });
    instance.on('payment.failed', (failure) => {
      input.onAttemptFailed?.(
        failure.error?.description ??
          'The payment did not go through. You can try again or use another method.',
      );
    });
    instance.open();
  });
}
