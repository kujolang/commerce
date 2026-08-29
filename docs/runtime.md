# Runtime and event delivery

Core uses Web Platform APIs. Thin exports cover Cloudflare, Node, Vercel, and Netlify conventions. Provider calls have bounded timeouts, safe public errors, optional structured diagnostic hooks, provider request IDs where exposed, explicit API versions, and idempotency for supported create/capture operations. Non-idempotent operations are not automatically retried.

`checkoutHandler()` accepts POST JSON containing only SKU, quantity, and an optional checkout attempt. It resolves every item from the deployed catalog, enforces availability/capabilities/bounds, and returns a validated hosted URL. PayPal Orders return `completion_required`; deploy `checkoutCompletionHandler()` to capture the payer-approved order on return. Fulfillment still waits for the verified capture webhook.

`webhookHandler()` performs: raw-body limit, fail-closed provider verification, normalization, deduplication claim, queue/sink delivery, mark processed, and acknowledgement. Provide an object with `claim()`, `markProcessed()`, and `release()` for durable deduplication. Provide `enqueue(event)`, `deliver(event)`, or a callback sink. Cloudflare handlers can pass `waitUntil` for deferred delivery. `createMemoryEventStore()` is not production durability.

Normalized event types are checkout approved/completed, order created/updated, subscription created/updated/cancelled, refund created, customer updated, payment failed, and unknown. Unknown verified events are observable but should not trigger fulfillment. The provider payload is intentionally not copied into the stable normalized event; consumers can archive raw verified payloads in a separately governed sink if required.
