import { checkoutCompletionHandler, checkoutHandler, customerPortalHandler, durableWebhookHandler, subscriptionHandler, webhookHandler } from './index.mjs';
export const cloudflareCheckout=options=>context=>checkoutHandler(context.request,{...options,env:context.env,executionContext:context});
export const cloudflareWebhook=options=>context=>webhookHandler(context.request,{...options,env:context.env,executionContext:context});
export const cloudflareCheckoutCompletion=options=>context=>checkoutCompletionHandler(context.request,{...options,env:context.env,executionContext:context});
export const cloudflareCustomerPortal=options=>context=>customerPortalHandler(context.request,{...options,env:context.env,executionContext:context});
export const cloudflareSubscription=options=>context=>subscriptionHandler(context.request,{...options,env:context.env,executionContext:context});
export const cloudflareDurableWebhook=options=>context=>durableWebhookHandler(context.request,{...options,env:context.env,executionContext:context});
