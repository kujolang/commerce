import {subscriptionHandler} from '@kujolang/commerce/runtime';

export const createHandler=({catalog,config,env,fetch,idempotencyStore,authenticateAndResolveConsent,rateLimiter})=>request=>subscriptionHandler(request,{catalog,config,env,fetch,idempotencyStore,resolveSubscriptionContext:authenticateAndResolveConsent,rateLimiter});
