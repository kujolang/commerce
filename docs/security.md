# Security

The browser is untrusted. It supplies SKU and quantity; the runtime resolves
provider IDs from a trusted deployment catalog. It never accepts prices, totals,
discounts, tax, shipping price, or secrets. Checkout is POST-only JSON, size and
quantity bounded, optional origin-restricted, and returns generic production
errors. Provider errors and secrets are not logged.

Stripe and Polar signatures are verified against the raw webhook body before
parsing. Commerce stores no cards, payment data, passwords, users, customers,
orders, subscriptions, inventory, or other authoritative state. Providers own
that state. Scan tracked/generated files and Git history before releases. Rotate
any credential ever committed, even if later deleted.
