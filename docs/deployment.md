# Deployment

Build from Git with Node 20+, Kujo CLI, an exact SSG tag, and an exact Commerce
tag. Cloudflare Pages uses `npm ci && npm run build`, output `output`, and Pages
Functions under `functions/`. Keep runtime secrets in Cloudflare variables.

Dynamic checkout endpoint: `POST /_kujo/commerce/checkout`, JSON body at most
16 KiB, SKU/quantity only. Webhook endpoint: `POST /_kujo/commerce/webhook` and
preserve the raw body. Configure host-level rate limits for public checkout
creation and strict allowed origins where appropriate. Link and catalog levels
need no function or secret.
