# Kujo Commerce

Kujo Commerce is a provider-agnostic commerce capability for static sites built
with Kujo SSG. It composes around the generator: content remains ordinary SSG
Markdown, Commerce validates product metadata and adds safe catalog/assets, and
an optional Web-API runtime creates hosted checkouts. SSG contains no commerce
logic and Commerce stores no payment, customer, order, subscription, or inventory
database.

## Quick start

```sh
npm install github:kujolang/commerce#v0.1.1
git clone --depth 1 --branch v1.0.0 https://github.com/kujolang/ssg vendor/ssg
npx kujo-commerce validate --site .
npx kujo-commerce build --site . --ssg vendor/ssg/build.kujo
kujo serve output --port 8080
```

Create `kujo-commerce.yml`, add `commerce:` metadata to Markdown under
`content/shop/`, load `assets/commerce/commerce.js` from the site's layout, and
place `[data-commerce-cart]` on the cart page. See [products](docs/products.md),
[providers](docs/providers.md), and [deployment](docs/deployment.md).

## Contracts

- catalog: `kujo-commerce/v1` at `/_kujo/commerce/catalog.json`
- cart: `kujo-cart/v1` stored under `kujo:commerce:cart:v1`
- normalized events: `kujo-commerce-event/v1`

The browser sends only SKU and quantity. Runtime checkout always resolves the
authoritative provider identifier from the trusted catalog.
