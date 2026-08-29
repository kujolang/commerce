# Square

Configure sandbox access token and `location_id`, then map each purchasable to a Square `catalog_object_id`. The adapter calls `CreatePaymentLink` with an idempotency key and a catalog-backed order, so Square remains authoritative for pricing, tax, discounts, inventory, and payment state. The current adapter intentionally does not claim Square subscription-plan checkout.

Webhook verification requires the exact public `notification_url` and subscription signature key because Square signs `notification_url + raw_body` with HMAC-SHA256.
