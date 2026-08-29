# PayPal

Use sandbox `api_base: https://api-m.sandbox.paypal.com`, environment names for client ID/secret, and a product `item_id` or subscription `plan_id`. One-time checkout creates an Orders v2 approval URL; the return route must call `checkoutCompletionHandler()` with PayPal's `token` as `provider_reference` to capture the approved order. Subscriptions create a Billing Subscription approval. Never fulfill from either return route; wait for a verified PayPal webhook.

PayPal webhook verification posts the exact headers/event plus configured `webhook_id` to PayPal's verification endpoint. The endpoint fails closed without webhook ID and API credentials.
