# Progressive reference deployments

These examples share Core contracts and require deployment-owned adapters. None of the dynamic examples uses in-memory durability in production.

1. `catalog-only/` is a plain static JSON catalog.
2. `../static-links/` is the zero-runtime hosted-link site.
3. `dynamic-checkout.mjs` exports the one-time checkout handler.
4. `dynamic-subscription.mjs` exports authenticated subscription enrollment.
5. `webhook-receiver.mjs` verifies and durably claims/enqueues provider events.
6. `event-worker.mjs` processes durable jobs with retry and dead-letter behavior.
7. `downstream-consumer.mjs` verifies signed provider-neutral outcomes and rejects replay.

Inject transactional implementations for `idempotencyStore`, `receiptStore`, `queue`, `deadLetters`, `replayStore`, and application authentication. Cloudflare can bind D1/Queues or Durable Objects; Netlify and Vercel can bind an external transactional database and queue; Node can bind the same interfaces directly. The business flow is not duplicated per host. Runtime bridges under `runtime/` convert each host's request shape.

Fictional example values are intentionally nonfunctional. A successful redirect never fulfills an order.
