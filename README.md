# Kujo Commerce

Provider-agnostic commerce for static sites, with first-class Kujo SSG integration.

Kujo Commerce validates product definitions, emits a trusted public catalog and presentation-neutral browser components, creates provider-hosted checkouts, opens provider-managed customer portals, and verifies/normalizes provider webhooks. Providers remain authoritative for payments, customers, subscriptions, orders, inventory, tax, and fulfillment. Commerce does not collect card data and is not a merchant system of record.

## Adoption levels

1. Catalog only: generate `/_kujo/commerce/catalog.json` and assets.
2. Hosted Link: ordinary HTTPS purchase links, no JavaScript or runtime required.
3. Dynamic checkout: browser cart sends only SKU and quantity; a Web-API runtime resolves trusted provider identifiers.
4. Events: verified webhooks flow through optional deduplication and queue/sink adapters.

Kujo SSG users run:

```sh
npm install @kujolang/commerce
npx kujo-commerce init --site .
npx kujo-commerce validate --site .
npx kujo-commerce build --site . --ssg vendor/ssg/build.kujo
npx kujo-commerce doctor --site .
```

`init` defaults to zero-runtime Static Mode. Products use pre-created provider
checkout links and the result can be hosted on GitHub Pages or any static file
host. Use `--mode hybrid` only when the site needs dynamic checkout or other
edge functionality. See [Static Mode](docs/static-mode.md) and the
[copyable hosted-link example](examples/static-links/README.md).

Generic static generators can call `loadConfig()`, `loadProducts()`, `validateStore()`, and `buildStatic()`, then embed `<kujo-buy-button sku="..."></kujo-buy-button>`, `<kujo-cart></kujo-cart>`, or the documented data attributes. Commerce UI has no SiteKit dependency.

## First-party providers

Stripe, Polar, PayPal, Square, Paddle, Lemon Squeezy, Link, and Mock are provider adapters behind one conformance-tested contract. Run `kujo-commerce providers --json` for the exact capability declaration. Provider differences are intentional; one-product and quantity restrictions are enforced at build time, in the browser, and again in the runtime.

## Stable v1 contracts

- catalog: `kujo-commerce/v1`
- cart: `kujo-cart/v1`
- normalized event: `kujo-commerce-event/v1`
- exact money: integer minor units plus ISO currency and presentation display
- runtime: Web Platform `Request`, `Response`, `fetch`, and Web Crypto

The wire formats are frozen for v1 while the package remains pre-1.0 for final
provider sandbox evidence. See the [compatibility and deprecation policy](docs/compatibility.md),
[architecture](docs/architecture.md), [products and variants](docs/products.md),
[providers](docs/providers.md), [generic static integration](docs/generic-static.md),
[runtime and webhooks](docs/runtime.md), [deployment](docs/deployment.md),
[Static Mode](docs/static-mode.md),
[production checklist](docs/production-checklist.md), [security policy](SECURITY.md),
and [threat model](docs/threat-model.md).
