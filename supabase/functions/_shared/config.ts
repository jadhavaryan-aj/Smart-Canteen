import { keyMode, type RazorpayMode } from './razorpay.ts';

export type EnvReader = (name: string) => string | undefined;

export interface PaymentConfig {
  configured: boolean;
  mode: RazorpayMode | null;
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
  apiBaseUrl: string;
  /** Why payments are unavailable, for operators (never shown with secrets). */
  problem: string | null;
}

/**
 * Loads Razorpay settings from the environment. Live keys are refused unless
 * ALLOW_LIVE_PAYMENTS=true is set explicitly, so a development deployment can
 * never take real money by accident.
 */
export function loadPaymentConfig(env: EnvReader): PaymentConfig {
  const keyId = env('RAZORPAY_KEY_ID')?.trim() || null;
  const keySecret = env('RAZORPAY_KEY_SECRET')?.trim() || null;
  const webhookSecret = env('RAZORPAY_WEBHOOK_SECRET')?.trim() || null;
  const apiBaseUrl = env('RAZORPAY_API_BASE_URL')?.trim() || 'https://api.razorpay.com/v1';
  const mode = keyMode(keyId);

  let problem: string | null = null;
  if (!keyId || !keySecret) {
    problem = 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set.';
  } else if (!mode) {
    problem = 'RAZORPAY_KEY_ID must start with rzp_test_ or rzp_live_.';
  } else if (mode === 'live' && env('ALLOW_LIVE_PAYMENTS') !== 'true') {
    problem = 'Live Razorpay keys are configured but ALLOW_LIVE_PAYMENTS is not "true".';
  } else if (
    !apiBaseUrl.startsWith('https://') &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(apiBaseUrl)
  ) {
    problem = 'RAZORPAY_API_BASE_URL must use https.';
  }

  return {
    configured: problem === null,
    mode,
    keyId,
    keySecret,
    webhookSecret,
    apiBaseUrl,
    problem,
  };
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}
