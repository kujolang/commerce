# Paddle

Configure a sandbox API key and map each purchasable to a current `pri_` price. The adapter creates an automatically collected transaction with items, quantities, custom SKU data, and an approved checkout URL. Paddle owns localized pricing, tax, subscriptions, and transaction state as Merchant of Record.

Portal sessions are created for a trusted Paddle customer ID. Webhooks use the raw body and `Paddle-Signature` (`ts` plus `h1`) with HMAC-SHA256 and a short replay window.
