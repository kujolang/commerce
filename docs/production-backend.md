# Optional production backend

The advanced modules are dependency-free contracts and deterministic in-memory test implementations. They do not make an in-memory process durable. A production deployment must bind the same contracts to transactional storage and a durable queue appropriate to its host.

## Ownership boundaries

- Core owns versioned provider-neutral contracts, offer revisions, convergence rules, signatures, and conformance behavior.
- Provider adapters own API URLs, versions, request/response shapes, webhook signatures, remote retrieval, and capability declarations.
- Persistence adapters own atomic claims, semantic-operation records, leases, cursors, outbox records, and dead letters.
- Runtime adapters translate host requests without choosing a database or queue.
- Applications own authentication, authorization, legal consent text, tax policy, fulfillment, entitlements, and operator roles.

Commerce is not a system of record, accounting system, Merchant of Record, tax adviser, or access-control policy engine. A success redirect is never proof of payment or permission to fulfill.

## Versioned contracts

`src/contracts.mjs` defines focused v1 identifiers for checkout sessions, customers, payment-method consent, subscriptions, payments, refunds, disputes, offer revisions, provider references and operations, reconciliation results, normalized events, signed downstream events, and delivery attempts. Existing catalog, cart, checkout, and normalized-event v1 documents are unchanged. New catalog fields are optional.

`createOfferRevision()` hashes canonical commercial input: SKU, variant, exact money, cadence, quantity limits, provider mapping, terms/consent versions, optional tax-policy reference, retirement, and successor. `createMemoryRevisionStore()` demonstrates publish-once behavior. Production stores must reject overwrites by revision ID and retain revisions referenced by checkouts or subscriptions.

## Semantic idempotency and unknown outcomes

Persist an operation intent before calling a provider. `executeProviderOperation()` retains one provider idempotency key across retries and records `not_started`, `submitted`, `succeeded`, `failed`, `unknown`, `recovered`, `retryable_failure`, or `terminal_failure`. After a timeout or connection loss, retry by retrieving/searching provider state first. Only submit again when provider idempotency guarantees make it safe. Do not store single-use payment tokens in the intent.

## Durable webhook topology

```text
provider -> size limit -> raw signature check -> atomic receipt claim -> durable queue -> 2xx
                                                        |
                                                        v
worker -> current provider state when needed -> projection/event -> processed
   | failure
   +-> bounded backoff -> dead letter -> authorized replay
```

`EventReceiptStore` implementations must atomically claim a provider event ID, allow expired leases to be reclaimed, and mark processed only after side effects commit. `DurableQueue` must not lose an acknowledged job. Raw event archiving is intentionally opt-in; set a retention policy, encrypt it, restrict access, and avoid PII in metric labels. Unknown verified event types remain observable `commerce.unknown` facts and must not trigger fulfillment.

## Reconciliation and event ordering

Reconciliation retrieves current provider state and uses provider version or update time to prevent backward transitions. Pagination is bounded, cursors/watermarks are persisted, and time scans should overlap to absorb delayed indexing. Default policy is report-only. `repair` must be explicitly selected and audited. Square currently implements direct subscription retrieval; other providers remain false until their adapters implement and test the contract.

## Signed downstream facts

Downstream events carry a stable event ID, aggregate ID and version, occurrence time, optional offer revision/customer reference, status, and schema version. HMAC-SHA256 covers timestamp, signing-key ID, and exact JSON. Consumers accept current and previous keys during rotation, enforce a short tolerance, persist replay fingerprints, and deduplicate stable event IDs. Consumers—not Commerce—decide access or fulfillment.

## Operator and failure recovery

`createOperatorService()` exposes receipt, job, dead-letter, drift, replay, and provider-link primitives. Mutation requires an authorization hook and audit sink. Use a request correlation ID. Never return provider errors or credentials to public clients.

Recovery order: inspect the semantic operation; query the provider; record recovered success if found; otherwise retry only with the original provider key. For webhooks, inspect receipt and queue state, reclaim expired leases, replay dead letters after correcting the cause, then run reconciliation. For signing failures, check clock skew and active key overlap before replay.

## Adapter conformance

Custom stores should run fault cases for atomic claims, duplicates, crash-after-claim, lease expiry, retry/backoff, dead-letter, replay, and consumer outage. Custom provider adapters should run capability, trusted-price, timeout, version pin, signature, normalization, and unsupported-feature cases. The in-memory adapters are deterministic fixtures, never production recommendations.

## CLI decision

`init`, `validate`, `build`, `doctor`, `providers`, and `verify` retain stable contracts. This release does not add `migrate`, `reconcile`, or `events replay`: those commands require application-owned adapter discovery, authorization, and audit configuration that the CLI cannot infer safely. They can be added after a versioned deployment-adapter manifest exists.
