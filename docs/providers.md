# Providers

| Capability | Stripe | Polar | Link | Mock |
|---|---:|---:|---:|---:|
| Hosted checkout | yes | yes | yes | yes |
| Dynamic checkout | yes | yes | no | yes |
| Multi-item | yes | no | no | yes |
| Quantity | yes | no | no | yes |
| Digital | yes | yes | yes | yes |
| Physical | yes | no | yes* | yes |
| Service | yes | yes | yes* | yes |
| Subscription | yes | yes | yes* | yes |
| Customer portal | yes | yes | no | yes |
| Webhooks | yes | yes | no | yes |

`*` Link delegates all semantics to its URL; Commerce cannot verify them.

Stripe uses hosted Checkout Sessions with trusted Price IDs and supports mixed
line items, quantities, payment/subscription mode, address/phone collection,
shipping countries and rates, automatic tax, promotion codes, custom fields,
success/cancel URLs, metadata, idempotency, and provider webhooks. Payment Links are a static
fallback. Polar is modeled around one product per checkout; current Checkout
Sessions, links, digital/software benefits, subscriptions, discounts, portal, and
webhooks are supported without pretending it is a Stripe-shaped cart. Mock is a
deterministic public/local demonstration provider. Link requires no server/key.

`kujo-commerce verify --site .` is intentionally read-only. It checks Stripe
Price/Product activity, currency, and suspicious display-price drift; Polar
Product activity/currency; Link HTTP reachability; and Mock locally. Live
verification requires explicit credentials; normal builds never query providers.
