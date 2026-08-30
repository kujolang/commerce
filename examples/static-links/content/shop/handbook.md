---
title: Static Commerce Handbook
description: Example digital product with a provider-hosted checkout link.
commerce:
  enabled: true
  sku: static-commerce-handbook
  type: digital
  price: { amount: 2900, currency: USD, display: "$29.00" }
  providers:
    link:
      url: https://example.com/?product=static-commerce-handbook
  cart: { enabled: false, quantity: false, min: 1, max: 1 }
---

Replace the example URL with a hosted checkout link from your provider.
