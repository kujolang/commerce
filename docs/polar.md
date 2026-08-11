# Polar

Configure Polar product IDs and reference `POLAR_ACCESS_TOKEN` and
`POLAR_WEBHOOK_SECRET` by environment variable name. V1 creates one-product
Checkout Sessions at a time and exposes `multi_item_checkout: false` and
`quantity: false`; UI and validation must not describe multiple checkouts as one
transaction. Polar is appropriate for digital/software products, subscriptions,
benefits/entitlements, discounts, its hosted customer portal, and signed webhooks.
Physical shipping is not claimed. Sandbox/live verification requires explicit
credentials and is not part of deterministic builds.
