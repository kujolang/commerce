# Square pre-Sandbox hardening review

2026-10-07; baseline `fb2591e`. Scope: owned payment/recovery paths, PostgreSQL adapter, webhook processing, OAuth connection lifecycle, authenticated HTTP handlers and browser checkout. This follow-up supplements the architecture threat model and implementation acceptance matrix; it is not a claim that external provider testing can be skipped.

## Changes and evidence

| Issue | Repair | Regression evidence |
| --- | --- | --- |
| Cached or unchanged transactions rewrote the whole JSONB aggregate | Compare the transaction's original serialized document before issuing its write; retain locks and independently committed inbox/outbox effects | Real PostgreSQL `xmin` stays unchanged over 20 no-op transactions; a genuine mutation changes it; existing rollback/fencing tests pass |
| Outbox dispatch sorted/scanned delivered history | Add partial `(scope,created_at,event_id)` index restricted to pending rows, with a matching literal SQL predicate | `EXPLAIN ANALYZE` uses the index with 5,000 events, only 10 pending; delivery remains scoped and bounded |
| A known payment failed processing if an unnecessary Orders API read failed | Resolve stored payment/reference/order mapping first; use Order retrieval only when local mapping is absent | Provider fixture fails Orders reads; mapped payment processes with zero Orders calls |
| Old worker's provider failure escaped when its lease had already been reclaimed | Treat a stale receipt during retry as superseded | Replacement receipt remains leased and unchanged |
| One optional lifecycle reconciler exception aborted a whole recovery page | Record unresolved result and continue; retain resume cursor semantics | Later operations still run after injected failure |
| Invalid sweep/publication limits silently removed bounds or produced unusable values | Require positive safe integer limits and cap supported sizes before I/O | NaN, infinity, fractions, zero and negatives rejected |
| Late definitive API error could downgrade an already verified payment or release a refund reservation | Preserve records with provider references, retain unknown operation state and return uncertain result | Inject concurrent completed observation followed by decline; completion remains intact and retrieval resolves operation |
| Invalid stored token expiry passed a JavaScript NaN comparison | Explicit finite expiry validation before decrypting credentials | Malformed persisted expiry fails closed |
| Delayed location discovery could overwrite a more recent connection selection/reconnect | Compare the pre-request generation under transaction lock; increment generation on selection | In-flight old selection rejects without overwriting newer location |
| Destroying a checkout during tokenization still allowed a later POST | Recheck destruction after tokenization; keep destroyed checkout disabled | Browser regression verifies no submission after teardown |
| Concurrent restart and submit could overlap in the browser | Share the existing busy guard for the entire restart operation | Duplicate restart rejected; submit suppressed until restart completes |

No global provider-response cache was introduced: current provider state and current OAuth credentials still control money movement. No transaction lock was removed and no concurrency was added around mutations. The performance evidence is reduced work and a verified query plan, not an invented production latency multiplier.

## Verification and deployment

The original targeted regressions reproduced failures before fixes. Full local validation passes 156 tests with PostgreSQL 14.20 enabled; browser tests exercise Chromium, Firefox and WebKit. CI additionally verifies supported Node versions, PostgreSQL16, dependency audit, CodeQL and secrets. See the linked commit's CI result for final remote status.

Run the additive payment-store migration to create the pending-outbox index. Ordinary index creation takes a write-blocking table lock: on a large deployed outbox, create the same index with `CREATE INDEX CONCURRENTLY` outside a transaction during rollout before invoking normal migrations. Existing tables, records, keys and schema identifiers are unchanged.

External Sandbox, SCA/OAuth and hardware/commercial gates in [implementation status](square-implementation-status.md) remain necessary. Host authorization, operational retention and production infrastructure remain deployment responsibilities. No provider credentials or live money were used in this review.
