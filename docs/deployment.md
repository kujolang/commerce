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

Load the browser entrypoint as an ES module so its versioned cart-state helper is
resolved beside it:

```html
<script type="module" src="/assets/commerce/commerce.js"></script>
```
