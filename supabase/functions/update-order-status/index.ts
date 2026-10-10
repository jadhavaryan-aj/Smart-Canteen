import { loadPaymentConfig } from '../_shared/config.ts';
import { allowedOrigins, getEnv } from '../_shared/deno/env.ts';
import { createAuthenticator, createServiceRpcClient, createUserRpcClient } from '../_shared/deno/supabase.ts';
import { createRazorpayApi } from '../_shared/razorpay.ts';
import { OrdersRepository, StaffRepository } from '../_shared/repository.ts';
import { updateOrderStatusHandler } from './handler.ts';

const config = loadPaymentConfig(getEnv);

Deno.serve(
  updateOrderStatusHandler({
    config,
    repo: new OrdersRepository(createServiceRpcClient()),
    razorpay:
      config.configured && config.keyId && config.keySecret
        ? createRazorpayApi({ keyId: config.keyId, keySecret: config.keySecret, baseUrl: config.apiBaseUrl })
        : null,
    authenticate: createAuthenticator(),
    staffRepoFor: (request) => new StaffRepository(createUserRpcClient(request)),
    allowedOrigins: allowedOrigins(),
  }),
);
