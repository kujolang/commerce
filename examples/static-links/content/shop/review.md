---
title: Architecture Review
description: Example service sold through an independent hosted checkout link.
commerce:
  enabled: true
  sku: architecture-review
  type: service
  price: { amount: 25000, currency: USD, display: "$250.00" }
  providers:
    link:
      url: https://example.com/?product=architecture-review
  cart: { enabled: false, quantity: false, min: 1, max: 1 }
---

Static Mode supports any number of independently hosted product links.
