# Square Step 1 implementation report

Scope: F1 event contract and F2 idempotency repair only. Recorded October 7, 2026.

## 1. Current-state verification

Implementation began on clean `main` at `9a0b3ad2f6bb457a05053a9d195994393af7bb61`.
Compared with reviewed `d0884c5e5ec2de5da57086ec0709d7bca34dcfee`, only four documentation files differed: the review, reproduction evidence, Square guide and changelog. Runtime behavior was unchanged. The original review and reproduction document remain historical baseline evidence.

Commerce is an ESM JavaScript package with injected HTTP providers, optional runtime handlers, memory fixtures and an optional injected PostgreSQL pool. Provider operations already persist a key, intent, operation type, state and result. PostgreSQL already serializes operation creation by primary key and submission by conditional UPDATE. No new financial domain is needed for this repair.

## 2. F1 root cause

`src/providers/builtins.mjs` emitted `commerce.payment.updated`, `commerce.refund.updated`, `commerce.payment.succeeded`, `commerce.dispute.created` and `commerce.dispute.updated`, none of which appeared in `schemas/event.schema.json`. AJV therefore rejected legitimate normalized observations. Separately, `payment.created` incorrectly became `commerce.order.created`. A synthetic lookup entry named `payment.updated.COMPLETED` could also be supplied directly as an unknown incoming event type and produce completion.

## 3. F1 implementation

The frozen v1 schema permits additive enum values. Six values are added: the five previously emitted values above and `commerce.payment.created`. No existing enum or field is removed.

| Square observation | Normalized observation | Meaning |
| --- | --- | --- |
| payment.created, any status | commerce.payment.created | Provider payment object exists; no assertion of payment completion or order creation |
| payment.updated, COMPLETED | commerce.checkout.completed | Existing compatibility mapping retained; verified provider completion observation, not a fulfillment command |
| payment.updated, other/missing status | commerce.payment.updated | Includes PENDING, APPROVED, failed, canceled and future statuses; never success |
| order.created / order.updated | commerce.order.created / updated | Order observation, not payment |
| refund.created / refund.updated | commerce.refund.created / updated | Separate refund lifecycle, including pending/rejected states |
| subscription.created / subscription.updated | commerce.subscription.created / updated | Provider subscription observation |
| invoice.payment_made | commerce.payment.succeeded | A payment associated with an invoice completed; does not assert the entire invoice is paid |
| invoice.scheduled_charge_failed | commerce.payment.failed | Scheduled invoice charge failed |
| dispute.created / dispute.state_changed | commerce.dispute.created / updated | Dispute lifecycle; historical payment is not rewritten as failed |
| other, inherited names, missing type, synthetic completion name | commerce.unknown | No default success |

Only the literal Square `type` field participates in dispatch. A null-prototype map prevents inherited property matches. Completion requires exactly `payment.updated` and nested `payment.status === 'COMPLETED'`. Invoice objects are unwrapped for their IDs. Existing order envelope IDs still use `data.id`.

Square documents [payment notifications](https://developer.squareup.com/docs/payments-api/webhooks) as object creation/change notifications, including pending ACH payments. Its [invoice.payment_made reference](https://developer.squareup.com/reference/square/webhooks/invoice.payment_made) says an associated payment completed. These support the distinctions above; consumers must still authenticate events and decide application transitions themselves.

Compatibility: `payment.created` intentionally changes from the incorrect order-created semantic. Consumers using it as an order trigger must migrate to actual order events. Existing completed-update and invoice-payment names remain. Consumers with vendored enum schemas must update them. The envelope and version stay v1.

## 4. F2 root cause

`operationKey` removed characters outside `[A-Za-z0-9_-]` and truncated to 45 characters. Thus `'a'.repeat(45)+'1'` and `'a'.repeat(45)+'2'` both sent `'a'.repeat(45)`. `a.b` and `ab` also aliased. The subscription handler independently truncated `kujo-${operationId}` to 45 characters, losing everything after the first 40 operation-ID characters. All these long subscription IDs were accepted by its 128-character request validator.

The executor passed the caller's key to mutation instead of the authoritative stored key. Memory creation compared JSON insertion order and did not check operation type; memory transitions allowed concurrent same-state submission.

## 5. F2 implementation and migration policy

Both reference stores now accept an omitted `idempotency_key` in `begin`. For a **new row only**, they allocate an opaque UUID. The existing text column already fits it. An existing row always retains its materialized key. Explicit caller keys remain supported for compatibility and must match on retry. The executor passes `record.idempotency_key` to mutation. Neither identity sanitization nor truncation remains.

PostgreSQL's INSERT ON CONFLICT followed by locked SELECT chooses one persisted winner. Losing UUID candidates never reach the provider. Type and canonical JSON intent must match. Conditional submission prevents competing in-flight mutations. Memory mirrors those semantics, but remains a process-local test fixture, not durable storage.

Subscription enrollment omits the generated key from its caller spec and persists server-authorized execution parameters inside intent: provider endpoint, location, optional trusted `connectionId`, customer/card IDs, start date, provider mapping and source name, plus existing SKU/revision/customer reference. Tokens and card sources are never stored. Endpoint binds Sandbox versus production. Changed effect, customer, merchant connection or endpoint conflicts before result reuse or provider submission.

Operation IDs are globally unique **within a store/schema**. Reusing one ID with another type/scope is rejected rather than silently borrowing its result/key. Applications must assign separate IDs to distinct operations. For multiple connections, provide a stable nonsecret `connectionId` from authenticated server context, or isolate stores per connection. Do not reuse a store under changed credentials without retaining the same merchant identity. This patch adds no OAuth connection model and cannot infer merchant identity from a secret token. UUID allocation is independent across operation types and isolated stores.

### Legacy and hosted checkout upgrade procedure

1. Preserve the operation table and backups. Do not reset rows, replace operation IDs or automatically rekey any previously attempted effect.
2. Existing rows with matching type/intent work through the executor with the original key, even when the new caller omits it. No backfill or database migration is performed, including for never-submitted rows.
3. Old subscription-handler rows lack the new execution binding. The handler **fails closed** on intent mismatch, including cached successes, because it cannot prove customer/merchant ownership from those rows. Reconcile under the original authenticated merchant context; retrieve known results through an application-authorized path. Only an operator who verifies the original scope and complete request parameters may enrich intent in an application-controlled migration, preserving the key and state. No automatic enrichment is included.
4. If a stored key contains characters or length that the old adapter transformed, it might not equal the key actually sent. The adapter now refuses that input before HTTP. Recover the actual old wire key from trusted request evidence or the old transformation, and verify its original operation/scope before supplying it explicitly. Never replace it with a fresh UUID as a retry workaround. Existing safe materialized keys pass through unchanged.
5. Hosted checkout has no operation store in its HTTP handler. Safe existing attempt keys, including browser-generated UUIDs, still pass through unchanged. Attempts longer than 45 characters and lossy direct inputs now fail before sending instead of aliasing; the handler's existing generic provider-error response is retained. New durable server callers can wrap `createCheckout` in `executeProviderOperation` and pass its key as `context.idempotencyKey`, which takes precedence over a long logical `checkoutAttempt`. Do not apply that new allocation path to an unrecorded legacy attempt without first recovering its original key.
6. A direct hosted call without any attempt identifier retains its previous per-call UUID behavior. Such calls cannot claim durable logical retry identity; retryable callers must supply the original attempt or use persisted execution. Explicit keys are caller-owned: callers must not intentionally assign one to distinct effects. These pre-existing stateless limitations are not a durable hosted checkout implementation.

Custom persistence adapters used with subscription enrollment must support omitted-key atomic allocation and return the authoritative key. Existing callers supplying explicit keys remain supported.

## 6. Failure analysis

| Case | Behavior and evidence |
| --- | --- |
| Created, never submitted | Existing key retained; new records allocate once before submission. Memory and PostgreSQL tests cover both. |
| Submitted with known result | Cached succeeded/recovered result returned without mutation after matching intent. Legacy success test sends nothing. |
| Submitted, unknown result | Recovery hook can resolve the effect; otherwise retry uses the stored key. Tests seed legacy unknown and inject a lost commit. |
| Crash after external success, before local commit | A surviving submitted row blocks automatic concurrent submission. Reconciliation/operator recovery can classify it unknown using the same key; no automatic lease takeover is introduced. A failed success commit that can record unknown retries with the original key after reconnect; the fake provider creates one effect. |
| Legacy retry after deployment | Safe stored keys are reused exactly. Unbound subscription intent or lossy legacy wire-key ambiguity blocks before mutation. No migration invents a replacement key. |

Reconciliation must verify the provider's endpoint-specific retention and retry rules before replaying an old unknown operation. This patch proves key stability, not indefinite provider-side deduplication or exactly-once financial execution.

## 7. Files changed

- `src/providers/builtins.mjs`: correct Square dispatch, schema-aligned observations, strict final key validation, optional explicit hosted key.
- `schemas/event.schema.json`: six additive event types.
- `src/idempotency.mjs`: allocate omitted keys once, retain existing keys, compare type/canonical intent, prohibit duplicate submissions, use stored key.
- `adapters/postgres.mjs`: atomic optional-key allocation and type matching; no DDL changes.
- `runtime/index.mjs`: remove subscription prefix truncation and bind trusted effect scope/parameters.
- `test/fixtures/square-events.mjs`: exhaustive intentional event mapping/status fixtures.
- `test/schema.test.mjs`: fixture-driven normalization/schema checks and unknown alias guards.
- `test/idempotency.test.mjs`: key, retry, concurrency, legacy, endpoint and authenticated handler regressions.
- `test/postgres.integration.test.mjs`: real database allocation/concurrency/reconnect/legacy/crash checks.
- `docs/square-step1-implementation.md`: this implementation report and upgrade procedure.
- `docs/square.md`, `docs/persistence-adapters.md`: discovery links and allocation contract.
- `CHANGELOG.md`: correctness changes and compatibility notices.

## 8. Tests added

- **36 Square fixture cases**: all 12 handled provider types; seven payment status variants on create/update; four refund statuses on create/update; full and partial invoice payment; dispute lifecycle; five unknown/prototype/synthetic names. Each checks exact semantics, object ID and actual v1 schema validation.
- **Square ignores non-Square event type aliases and missing payment status**: event_type/meta aliases and absent/wrongly nested completion status cannot promote success.
- **long operation identities allocate distinct persisted UUIDs and retries retain them**: 101-character IDs with identical prefixes differ; type, merchant, environment and changed intent conflict; canonical property order does not.
- **concurrent begin and execution choose one key and one in-flight mutation**: 16 memory allocations agree; a held mutation prevents a second submission.
- **never-submitted, known, unknown, crashed and legacy operations never rekey**: legacy key/state matrix and explicit replacement rejection.
- **Square rejects lossy legacy inputs before sending and accepts explicit materialized keys unchanged**: checkout/customer/card/subscription boundaries reject punctuation/long aliases with zero network calls; explicit hosted key takes precedence.
- **subscription HTTP long IDs have distinct keys, scope and effect intent are bound, unbound legacy fails closed**: real handler routing with injected provider HTTP, cached retry, changed authenticated customer/card/connection/start date/location/endpoint/plan rejection and legacy key retention.
- **PostgreSQL operation keys survive races, reconnects and legacy state recovery**: 24 competing inserts, 12 competing executors, distinct long/type IDs, scope conflicts, old-format rows across every migration state, reopened pools, repeated migration and simulated external success/local commit loss. Only uniquely named disposable test schemas are dropped.

## 9. Gate results

Run from the Commerce repository; full logs were retained locally in `/tmp/commerce-step1-*.log`.

| Command | Result |
| --- | --- |
| `npm run validate` before edits | 65 passed, 1 PostgreSQL test skipped, 0 failed |
| `node --test test/schema.test.mjs test/idempotency.test.mjs` before source fixes | 14 passed, 29 failed as expected; executable regression reproduction |
| `node --test test/schema.test.mjs test/idempotency.test.mjs test/production-backend.test.mjs` after initial fixes | 55 passed, 0 failed/skipped |
| `COMMERCE_POSTGRES_URL='postgresql:///postgres?host=/tmp' npm run test:postgres` | 2 passed, 0 failed/skipped; real local PostgreSQL 14.20 |
| `npm run test:conformance` | 21 passed, 0 failed/skipped |
| `npm run test:fault` | 4 matching tests passed, 0 failed/skipped |
| `npm run test:schemas` | 40 passed, 0 failed/skipped |
| `COMMERCE_POSTGRES_URL='postgresql:///postgres?host=/tmp' npm run validate` final | 109 passed, 0 failed/skipped (including both PostgreSQL tests) |
| `npm run test:browser` | 15 passed across Chromium, Firefox and WebKit after browser installation |
| `npx playwright install chromium firefox webkit` | Passed; installed missing browser revisions |
| `PATH=/usr/local/opt/node@20/bin:$PATH COMMERCE_POSTGRES_URL='postgresql:///postgres?host=/tmp' npm run validate` | 109 passed; installed alias resolves to Node 26.7.0, **not** Node 20 evidence |
| `PATH=/usr/local/opt/node@22/bin:$PATH COMMERCE_POSTGRES_URL='postgresql:///postgres?host=/tmp' npm run validate` | 109 passed; installed alias resolves to Node 26.7.0, **not** Node 22 evidence |
| `git diff --check` | Passed |

The first browser attempt failed to launch all 15 tests because the exact Playwright browser revisions were absent; this was an infrastructure failure, not a passing or skipped browser gate. Browser installation/retry outcome is recorded above.

Local runtime: Node 26.7.0. PostgreSQL 16 and the full Node 20/22/24 matrix were not exercised. Credentialed Square Sandbox and production operations were intentionally not run. Provider calls in new tests are injected fixtures; no real payment moved. No separate build or lint script exists; validate runs syntax, security-pattern and repository tests, including static build fixtures.

## 10. Compatibility assessment

| Surface | Assessment |
| --- | --- |
| Public API | No exports removed. Optional omitted-key allocation extends store begin; custom stores must implement it for the updated subscription handler. Optional hosted context.idempotencyKey is additive. |
| Event schema | Six enum additions, same v1 envelope. Incorrect payment-created mapping repaired; see section 3. |
| Persisted data | Same schema/tables/columns. Existing keys immutable. New subscription intent includes trusted binding; legacy automatic handler retries fail closed. |
| Hosted checkout | Safe/UUID attempts unchanged. Long/lossy keys explicitly rejected; stateless lifetime limitations documented. |
| Subscriptions | New operations get persisted UUIDs and reject altered trusted intent. Existing unbound rows require reconciliation. |
| Other providers | No provider adapter changes; shared store behavior now checks types and prevents repeated submitted transitions. Existing explicit-key callers supported. |
| Static operation | No new runtime dependency, browser change, or generated secret. Existing static/build tests remain in validation. |

## 11. Remaining risks

No claim of live Square acceptance, managed PostgreSQL reliability, PostgreSQL 16 parity, or complete supported-Node matrix coverage is made. UUID uniqueness is probabilistic at standard UUID strength; no identity-prefix collision remains. Submitted rows still require explicit reconciliation after process death; there is no automatic operation lease recovery. Intent binding cannot infer a merchant from replaced credentials. Stateless hosted attempts and malformed legacy keys need the policy above. The compact event envelope still omits full provider lifecycle data and cannot replace the future durable reducer. None of these limits is a newly implemented later-roadmap feature.

## 12. Recommended next step

Ready for review of Step 2: provider-module separation and durable commerce-domain groundwork. F1/F2 have regression and real PostgreSQL evidence; upgrade constraints are explicit. Before deploying this patch to an existing installation, inventory legacy unbound/uncertain operations and reconcile using their original keys. Do not enable broad payments, embedded checkout, refunds, OAuth or invoicing from this patch. Step 2 has not been started.
