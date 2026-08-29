# Generic static-site integration

Commerce Core does not require Kujo SSG. A generator can load configuration/products, validate, and emit the catalog/assets with `buildStatic({ siteRoot, output, config, products })`. Routing remains generator-owned: set `commerce.url`, use frontmatter `canonical_url`, or pass `routeResolver` to `loadProducts()`.

Load `/assets/commerce/commerce.js` as a module. Use `<kujo-buy-button sku="SKU">`, `<kujo-cart>`, `<kujo-product sku="SKU">`, or the equivalent `data-commerce-*` hooks. The custom elements are deliberately unstyled. A design system may target them without becoming a Core dependency.

Link mode is progressive HTML: render the validated hosted URL as an ordinary anchor. Dynamic providers require the checkout endpoint; catalog-only and Link deployments do not.
