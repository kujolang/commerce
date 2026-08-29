# Migration to 0.3

Structured money is now authoritative:

```yaml
price:
  amount: 2900
  currency: USD
  display: "$29.00"
```

Legacy `display` plus `currency` remains accepted and is converted during the build, but should be migrated before v1. Currency exponents are not assumed to be two.

Products may add stable `commerce.id` and `variants[]`; simple one-SKU products still work. Canonical routes may use `commerce.url`. Catalog items now include `product_id`, structured `price`, provider capabilities, and cart policy while retaining `price_display` and `currency` compatibility fields.

Webhook success returns `202` for newly accepted events and wraps the normalized event under `event`; duplicates return `200`. Production callers should provide a durable store and sink. Missing webhook secrets now return `503` instead of accepting a placeholder. Runtime provider functions route through adapters, but the compatibility exports remain.
