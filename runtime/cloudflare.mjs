import { checkoutCompletionHandler, checkoutHandler, webhookHandler } from './index.mjs';
export const cloudflareCheckout=options=>context=>checkoutHandler(context.request,{...options,env:context.env,executionContext:context});
export const cloudflareWebhook=options=>context=>webhookHandler(context.request,{...options,env:context.env,executionContext:context});
export const cloudflareCheckoutCompletion=options=>context=>checkoutCompletionHandler(context.request,{...options,env:context.env,executionContext:context});
