# Kujo Commerce

[![Version](https://img.shields.io/badge/version-0.5.0-black)](https://github.com/kujolang/commerce/releases/tag/v0.5.0)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![Kujo SSG](https://img.shields.io/badge/integrates%20with-Kujo%20SSG-white.svg)](https://github.com/kujolang/ssg)

Add product catalogs, hosted checkout, carts, and verified payment events to static or dynamic sites. Start with ordinary purchase links. Add a runtime, durable storage, and payment operations when your site needs them.

Commerce works with Kujo SSG and other site generators. It keeps payment code outside the SSG and leaves payments, tax, inventory, and settlement with your provider.

## Quick start

Requires Node.js 20 or later.

```sh
npm install @kujolang/commerce
npx kujo-commerce init --site .
npx kujo-commerce validate --site .
npx kujo-commerce build --site . --ssg vendor/ssg/build.kujo
npx kujo-commerce doctor --site .
```

Set `--ssg` to your Kujo SSG build script. The initializer creates a Static Mode configuration: products use pre-created HTTPS checkout links, with no browser JavaScript or server required. Host the output on GitHub Pages or any static file host. See the [Static Mode guide](docs/static-mode.md) and [hosted-link example](examples/static-links/README.md).

Use `init --mode hybrid` for a cart or dynamic checkout. The browser sends SKU and quantity; the runtime resolves trusted product and provider data.

Other generators can use `loadConfig()`, `loadProducts()`, `validateStore()`, and `buildStatic()`. Add `<kujo-buy-button sku="..."></kujo-buy-button>`, `<kujo-cart></kujo-cart>`, or the documented data attributes to your templates. The browser components do not depend on SiteKit. See [generic static integration](docs/generic-static.md).

## Choose what to add

| Need | Commerce provides |
| --- | --- |
| Product pages | Validated products, variants, exact prices, a public catalog, and browser assets |
| Simple purchases | Hosted checkout links with no runtime |
| Dynamic checkout | A cart, provider-hosted checkout, and customer portals |
| Payment events | Raw-body webhook verification and normalized events |
| Reliable processing | Optional receipts, queues, leases, retries, dead letters, and replay |
| Recurring payments | Consent records, idempotent operations, and provider-specific subscription actions |
| Recovery | Provider-state lookups, bounded reconciliation, and drift reports |
| Fulfillment integration | Signed billing events for your fulfillment or entitlement service |

Static builds need no database, queue, cloud SDK, or provider API call. Durable processing needs storage and workers supplied by your deployment; an optional PostgreSQL adapter and [deployment example](examples/postgres-production/README.md) are included. In-memory stores are test fixtures.

## Providers and release scope

Commerce includes adapters for Stripe, Polar, PayPal, Square, Paddle, Lemon Squeezy, Link, and Mock. Each declares its supported features. Run `npx kujo-commerce providers --json` for the capability list. Product and quantity restrictions are checked during builds, in the browser, and in the runtime.

The maintainer has confirmed working Square and Stripe integrations. Version 0.5.0 ships the core commerce tool and optional Square payment modules. That confirmation does not establish live acceptance of every adapter or optional feature. See the [acceptance status](docs/square-implementation-status.md) for the tested boundaries and remaining checks.

Optional Square modules add owned orders, direct payments and refunds, embedded card tokenization, saved-card consent, subscriptions, invoices, and encrypted merchant connections. Sensitive card entry stays in Square's SDK; Commerce receives a transient token. Application fees, catalog/inventory integrations, Terminal, and reporting remain off by default. Enable them only after the relevant provider and deployment checks. See [owned payments](docs/owned-payments.md), [merchant connections](docs/square-connections.md), and the [owned-payment example](examples/owned-payments/README.md).

## Contracts and upgrades

The package remains pre-1.0. Its v1 wire contracts are frozen:

- Catalog: `kujo-commerce/v1`
- Cart: `kujo-cart/v1`
- Events: `kujo-commerce-event/v1`
- Money: integer minor units, ISO currency, and display text
- Runtime: Web Platform `Request`, `Response`, `fetch`, and Web Crypto

Static and hosted-link users need no configuration changes for 0.5.0. Runtime and custom-adapter users should read the [migration guide](docs/migration-0.5.md), [compatibility policy](docs/compatibility.md), and [changelog](CHANGELOG.md).

## Documentation

- **Build a store:** [architecture](docs/architecture.md), [products and variants](docs/products.md), [providers](docs/providers.md), [runtime and webhooks](docs/runtime.md).
- **Deploy:** [deployment](docs/deployment.md), [production backend](docs/production-backend.md), [persistence](docs/persistence-adapters.md), [reference examples](examples/reference/README.md), [production checklist](docs/production-checklist.md).
- **Operate:** [subscriptions](docs/subscriptions.md), [reconciliation](docs/reconciliation.md), [downstream events](docs/downstream-events.md), [operator runbook](docs/operator-runbook.md), [failure recovery](docs/failure-recovery.md), [staging checks](docs/staging-runbook.md).
- **Extend and maintain:** [provider authoring](docs/provider-authoring.md), [security policy](SECURITY.md), [threat model](docs/threat-model.md), [release policy](docs/release.md).

## Development

```sh
npm ci
npm run validate
npm run test:browser
```

Install Playwright's browsers before running browser tests. PostgreSQL tests need an isolated database set through `COMMERCE_POSTGRES_URL`. Provider Sandbox tests need separate test credentials and explicit opt-in for mutations; see the [staging runbook](docs/staging-runbook.md).
