# Products and configuration

`kujo-commerce.yml`:

```yaml
enabled: true
provider: mock
site_url: https://shop.example.com
content: content
assets: assets
output: output
cart:
  enabled: true
  multi_item: true
  storage: local
  currency: USD
checkout:
  success_url: https://shop.example.com/checkout/success/
  cancel_url: https://shop.example.com/checkout/cancel/
providers:
  stripe:
    secret_key_env: STRIPE_SECRET_KEY
    webhook_secret_env: STRIPE_WEBHOOK_SECRET
    automatic_tax: false
    promotion_codes: true
    billing_address_collection: auto
    phone_collection: false
    allowed_shipping_countries: [US, CA]
  polar:
    access_token_env: POLAR_ACCESS_TOKEN
    webhook_secret_env: POLAR_WEBHOOK_SECRET
  mock:
    enabled: true
```

Product frontmatter:

```yaml
---
title: Kujo Commerce Handbook
description: A practical handbook for static commerce.
featured_image: /images/handbook.webp
commerce:
  enabled: true
  sku: kujo-commerce-handbook
  type: digital
  price:
    amount: 2900
    display: "$29.00"
    currency: USD
  providers:
    stripe:
      price_id: price_example
    polar:
      product_id: 00000000-0000-0000-0000-000000000000
    link:
      url: https://example.com/demo-purchase
  cart:
    enabled: true
    quantity: true
    min: 1
    max: 10
  availability: available
---
```

Types are `digital`, `physical`, `service`, and `subscription`. Validation reports
the source file, provider, problem, and remediation context. Provider-specific IDs
remain nested. Secrets are environment-variable names in config, never values.

`amount` is exact minor units and authoritative; `display` is presentation. Currency exponents are ISO-aware rather than assumed to be two. Legacy display-only prices remain a temporary migration path.

For multiple purchasables, add `commerce.id` and variants. Each variant has a stable `id`, `sku`, optional price/provider overrides, availability, quantity policy, and attributes:

```yaml
commerce:
  enabled: true
  id: developer-tee
  type: physical
  price: { amount: 3200, currency: USD, display: "$32.00" }
  providers: { stripe: { price_id: price_default } }
  variants:
    - id: black-medium
      name: Black / Medium
      sku: tee-black-m
      attributes: { color: black, size: M }
      providers: { stripe: { price_id: price_black_m } }
```

Use `commerce.url` when the generator route is not `/shop/<filename>/`. The SSG remains authoritative for routing.
