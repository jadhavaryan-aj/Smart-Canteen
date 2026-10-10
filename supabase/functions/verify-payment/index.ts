import { loadPaymentConfig } from '../_shared/config.ts';
import { allowedOrigins, getEnv } from '../_shared/deno/env.ts';
import { createAuthenticator, createServiceRpcClient } from '../_shared/deno/supabase.ts';
import { createRazorpayApi } from '../_shared/razorpay.ts';
import { OrdersRepository } from '../_shared/repository.ts';
import { verifyPaymentHandler } from './handler.ts';

const config = loadPaymentConfig(getEnv);

Deno.serve(
  verifyPaymentHandler({
    config,
    repo: new OrdersRepository(createServiceRpcClient()),
    authenticate: createAuthenticator(),
    razorpay:
      config.configured && config.keyId && config.keySecret
        ? createRazorpayApi({ keyId: config.keyId, keySecret: config.keySecret, baseUrl: config.apiBaseUrl })
        : null,
    allowedOrigins: allowedOrigins(),
  }),
);
