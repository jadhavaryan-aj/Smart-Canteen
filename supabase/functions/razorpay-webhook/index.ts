import { loadPaymentConfig } from '../_shared/config.ts';
import { getEnv } from '../_shared/deno/env.ts';
import { createServiceRpcClient } from '../_shared/deno/supabase.ts';
import { createRazorpayApi } from '../_shared/razorpay.ts';
import { OrdersRepository } from '../_shared/repository.ts';
import { razorpayWebhookHandler } from './handler.ts';

const config = loadPaymentConfig(getEnv);

// Called by Razorpay's servers, not browsers: no CORS and no JWT. Requests are
// authenticated with the webhook signature instead (verify_jwt = false).
Deno.serve(
  razorpayWebhookHandler({
    config,
    repo: new OrdersRepository(createServiceRpcClient()),
    razorpay:
      config.configured && config.keyId && config.keySecret
        ? createRazorpayApi({ keyId: config.keyId, keySecret: config.keySecret, baseUrl: config.apiBaseUrl })
        : null,
  }),
);
