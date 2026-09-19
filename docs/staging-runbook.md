# Staging and production promotion runbook

## Repository gate

Run `npm ci`, `npm run validate`, `npm run test:browser`, `npm run test:conformance`, `npm run test:fault`, `npm run benchmark`, `npm audit`, package inspection, and the PostgreSQL integration test against PostgreSQL 16 or a supported managed equivalent. With `COMMERCE_POSTGRES_URL` set, run `npm run benchmark:postgres`; its event count and per-stage budget are configurable with `COMMERCE_POSTGRES_BENCHMARK_EVENTS` and `COMMERCE_POSTGRES_BENCHMARK_BUDGET_MS`.

## Infrastructure gate

Deploy migrations before receivers/workers. Prove atomic receipt-plus-enqueue by forcing enqueue failure and confirming no claimed receipt commits. Terminate a worker after lease acquisition and confirm another worker reclaims the expired lease. Send duplicate-event storms, stop the consumer until outbox retry/dead-letter behavior is visible, authorize a replay, and confirm one consumer fact. Exercise signing-key overlap and reject an expired or replayed signature. Restore a database backup into an isolated environment and reconcile record counts.

## Square Sandbox gate

- Confirm the API origin and `Square-Version: 2026-09-16`.
- Exercise exact customer match, no match/create, and ambiguous-match rejection.
- Create a saved card from a single-use Web Payments SDK token after explicit, unselected consent; verify that the token is absent from storage and logs.
- Create the subscription twice with one semantic operation ID and verify one provider subscription.
- Interrupt the response after submission, retry with the same idempotency key, and recover one subscription.
- Observe activation, renewal, scheduled-charge failure, recovery, scheduled cancellation, pause, and resume.
- Deliver duplicate, stale, out-of-order, malformed, oversized, and invalid-signature webhooks.
- Remove one webhook delivery and confirm reconciliation converges the subscription.
- Exercise refund and dispute events where the Sandbox supports them.

Record provider request IDs, timestamps, expected/actual states, and sanitized evidence. Do not fabricate unavailable provider behaviors.

## Promotion gate

Use separate Sandbox and production credentials, provider objects, webhook URLs, signing keys, databases, and queues. Review the offer revision, consent and terms versions, tax responsibility, retention rules, alert ownership, backup objectives, rollback procedure, and on-call runbook. Start with a low-volume canary, reconcile against the provider, then increase traffic. A successful redirect never authorizes fulfillment.

Repository tests establish repository readiness. Sandbox evidence establishes provider integration behavior. Staging establishes deployed-infrastructure behavior. None alone establishes ongoing production operational readiness.
