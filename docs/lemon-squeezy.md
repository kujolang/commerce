# Lemon Squeezy

Configure API key and `store_id`, then map each purchasable to a numeric `variant_id`. A checkout is one variant at a time; Commerce does not pretend it supports a Stripe-shaped multi-item cart. Lemon Squeezy is authoritative for localized checkout, tax, subscriptions, licenses/entitlements, and order state as Merchant of Record.

Customer portal URLs must come from a verified Lemon Squeezy customer/order context or explicit trusted configuration. Webhooks verify `X-Signature` as the HMAC-SHA256 of the raw body.
