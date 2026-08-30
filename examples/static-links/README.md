# Zero-runtime hosted-link example

This directory is a complete static storefront. Deploy `site/` directly to
GitHub Pages or any static host. It uses harmless `example.com` destinations;
replace them with hosted checkout links created in your payment provider.

No build runtime, server function, API key, database, or webhook is required to
serve the example.

The accompanying `kujo-commerce.yml` and `content/shop/*.md` show the equivalent
Commerce source configuration. From the repository root, validate it with:

```sh
node bin/kujo-commerce.mjs validate --site examples/static-links
```
