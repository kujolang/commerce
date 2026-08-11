# Stripe

Configure Price IDs under each product and reference `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` by environment variable name. Runtime uses server-side
Checkout Sessions and redirects to Stripe-hosted Checkout; it never collects card
data. The adapter supports one-time/subscription mode, multiple lines, quantities,
success/cancel URLs, billing/shipping address collection, allowed shipping
countries and rates, automatic tax, promotion codes, phone collection, custom
fields, customer creation, metadata, and idempotent attempts. Use Stripe's
customer portal URL or a server-created portal session for `/account/`.

Webhook signatures are HMAC-SHA256 over `timestamp.raw_body` with tolerance.
Fulfillment must depend on verified webhooks, not the success-page redirect.
Payment Links can be represented by LinkProvider for a serverless static path.

Current implementation references: [Checkout Sessions](https://docs.stripe.com/payments/checkout-sessions),
[create-session API](https://docs.stripe.com/api/checkout/sessions/create),
[customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal),
and [webhook signatures](https://docs.stripe.com/webhooks/signature).
