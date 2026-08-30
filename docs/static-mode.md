# Static Mode: commerce with no server runtime

Static Mode keeps the entire site deployable as files. It requires no Node
server, serverless function, database, API credential, webhook receiver, or
provider SDK. Each product points to a pre-created checkout URL hosted by the
payment provider.

Initialize a site with:

```sh
npx @kujolang/commerce init --site . --mode static
```

Static Mode is the default. Replace the example product URL with a Stripe
Payment Link, PayPal payment URL, Square payment link, Paddle checkout, Lemon
Squeezy checkout, Polar checkout, or any other credential-free HTTPS checkout
URL:

```yaml
commerce:
  enabled: true
  sku: handbook
  type: digital
  price: { amount: 2900, currency: USD, display: "$29.00" }
  providers:
    link:
      url: https://provider.example/your-hosted-checkout
  cart: { enabled: false, quantity: false, min: 1, max: 1 }
```

Render `providers.link.url` as an ordinary anchor. The resulting storefront can
be hosted on GitHub Pages, Cloudflare Pages, Netlify, S3, or any static file
host. The payment provider remains dynamic, but the merchant's site operates no
server resources.

Static Mode can contain any number of products. Each link represents a checkout
configured in advance. Combining arbitrary cart items into a newly created
provider checkout, customer-specific portal sessions, webhook automation, and
server-authoritative fulfillment require optional Hybrid Mode.

See `examples/static-links` for a copyable zero-runtime site.
