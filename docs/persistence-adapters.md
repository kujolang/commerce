# Persistence adapter guide

Production adapters must provide atomic semantic-operation creation, compare-and-set state transitions, atomic provider-event claims, reclaimable leases, durable queue enqueue before acknowledgement, retry scheduling, dead letters, replay, reconciliation cursors, and transactional outbox records. Store IDs, state, safe provider references, and redacted diagnostics. Do not store raw card data or single-use payment tokens. Raw webhook payloads require an explicit encrypted archive and retention policy. Run `npm run test:conformance` and `npm run test:fault` against custom implementations.

`@kujolang/commerce/adapters/postgres` is the first production reference. It accepts a `pg.Pool`, creates its objects in a configurable schema, and uses row-level locks plus `SKIP LOCKED` for competing workers. `ingress.claimAndEnqueue()` commits the provider receipt and queue job in one transaction. Install `pg` in the deploying application; it remains optional for static users. See the [complete topology](../examples/postgres-production/README.md).

Use that atomic `ingress` with `durableWebhookHandler`. The separate `receiptStore` plus `queue` handler arguments remain compatible for tests and older adapters, but cannot make receipt claiming and enqueueing one transaction.
