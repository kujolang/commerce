# Deployment

Build from Git with Node 20+, Kujo CLI, an exact SSG tag, and an exact Commerce
tag. Cloudflare Pages uses `npm ci && npm run build`, output `output`, and Pages
Functions under `functions/`. Keep runtime secrets in Cloudflare variables.

Dynamic checkout endpoint: `POST /_kujo/commerce/checkout`, JSON body at most
16 KiB, SKU/quantity only. Webhook endpoint: `POST /_kujo/commerce/webhook` and
preserve the raw body. Configure host-level rate limits for public checkout
creation and strict allowed origins where appropriate. Link and catalog levels
need no function or secret.

Exports under `@kujolang/commerce/runtime/cloudflare`, `/node`, `/vercel`, and
`/netlify` adapt host request conventions without changing Core. Configure an
infrastructure rate limit, a 10-second-or-shorter provider timeout, and structured
diagnostics. Never automatically retry a checkout create/capture unless the
provider operation uses the supplied idempotency key.

## Runtime verification matrix

| Host | Entry point | Request model | Rate-limit placement |
| --- | --- | --- | --- |
| Cloudflare Pages/Workers | `cloudflareCheckout`, `cloudflareCheckoutCompletion`, `cloudflareCustomerPortal`, `cloudflareWebhook` | Web `Request` plus `env` and `waitUntil` | WAF rate-limiting rule or a Durable Object binding |
| Vercel Functions | `vercelHandler(coreHandler)` | Node request/response converted to Web types | WAF rate-limit rule or a shared external limiter |
| Netlify Functions | `netlifyHandler(coreHandler)` | Web `Request`/`Response` | Netlify rate-limiting rule or a shared external limiter |
| Node | `toWebRequest` and `sendWebResponse` | Node HTTP bridge | Reverse proxy or a shared external limiter |

All four shapes run in `test/runtime-adapters.test.mjs`. The optional
`createMemoryRateLimiter` is for tests and single-process demos only; production
deployments need a host-level or shared atomic limiter. Pass that limiter as
`rateLimiter` and use a host-authored client key via `rateLimitKey`.

The customer-portal handler requires `resolveCustomer(request)`. It never trusts
a customer ID from the request body. PayPal returns must send the provider's
`token` to `POST /_kujo/commerce/checkout/complete`; the browser component does
this automatically on a page containing `[data-commerce-complete]`.

Load the browser entrypoint as an ES module so its versioned cart-state helper is
resolved beside it:

```html
<script type="module" src="/assets/commerce/commerce.js"></script>
```
