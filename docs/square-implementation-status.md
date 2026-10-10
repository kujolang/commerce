# Square implementation and acceptance status

Updated 2026-10-10. This implements the locally testable roadmap from [the architecture review](square-integration-review.md), after the committed F1/F2 prerequisite fixes. API protocol remains pinned to `2026-09-16`. Version 0.5.0 packages these modules for release. Production acceptance remains specific to each enabled feature and deployment.

| Roadmap step | Implemented surface | Boundary |
| --- | --- | --- |
| 2 Provider split | `src/providers/square/` protocol modules | Provider registry/public legacy exports remain compatible |
| 3 Owned domain | Scoped frozen orders, payment/refund states, explicit fulfillment | Host owns pricing, tax, customer identity and fulfillment policy |
| 4 Durable execution | Additive PostgreSQL aggregates, inbox/outbox, generation fences | Existing v1 records/keys are never migrated or regenerated |
| 5 Hosted recovery | Persisted link/order/reference mapping, bounded lookup | Missing/ambiguous lookup stays unknown; no fallback double charge |
| 6 Payments | Direct create/retrieve/capture/cancel, partial/full refunds | Unknown refunds require verified provider-ID evidence |
| 7 Embedded checkout | Authenticated Fetch handlers and card/SCA SDK helper | Wallets, ACH, Cash App, gift cards and Afterpay UI are not enabled by this milestone |
| 8 Cards/subscriptions | Independent consent, safe card display, monthly static enrollment and schedule actions | No trial/multiphase/relative/prorated plans or recurring ACH; host manages provider customer mapping |
| 9 Invoices | Approved order, draft, publish, cancel, retrieved partial/full paid state | Manual sharing; automatic saved-card charging disabled; invoice payment is not fulfillment |
| 10 Connections | OAuth state, scopes, encrypted tokens, refresh, revoke, location selection, live token resolver | Multi-seller Sandbox and production commercial acceptance remain external gates |
| 11 Fees | Explicit policy validation, exact allocation, provider-returned accounting fields | Disabled by default; commercial approval/merchant consent evidence required |
| 12 Optional integrations | One-way catalog export/import, inventory counts, device pairing, Terminal checkout/cancel, read-only disputes/payouts | All flags default off; no bidirectional sync, automatic inventory decrement, dispute acceptance or hardware approval |
| Operations | Bounded sweep, dead-letter replay, outbox publication, deployment CLI and example | Host supplies scheduler, authorization, durable audit destination and alerting |

## Verification and promotion

Local validation includes provider contracts, schema validation of generated payment/refund observations, live PostgreSQL transaction/fencing/reload tests, fault injection, browser SDK fixtures, optional-module fixtures and CLI authorization. Supported Node 20/22/24 runs and three browser engines are recorded in the session evidence. Browser tests substitute the Square SDK; they do not prove live SCA or wallet behavior.

Run `COMMERCE_POSTGRES_URL=... npm run validate`, `npm run test:browser`, and `npm run test:postgres` with an isolated test database. Tests create and remove unique schemas. Sandbox mutations are opt-in with `COMMERCE_RUN_MUTATING_SANDBOX=true`; `npm run test:sandbox` skips when the needed credentials are absent. The dedicated Square payment suite always uses `connect.squareupsandbox.com`, checks duplicate create, declines, retrieval, partial/full refunds, delayed capture and cancellation. Retain Sandbox test IDs in a protected acceptance record when run; failures may leave Sandbox objects requiring review.

**Maintainer report (2026-10-10):** Square and Stripe integrations have been confirmed working. This report does not specify environments or cover every lifecycle path; it does not replace feature-specific acceptance evidence.

**Feature-specific acceptance still requires recorded evidence:** credentialed single-owner payment/webhook/SCA tests; two-seller OAuth consent/refresh/revoke; live card storage and subscription/invoice billing; Terminal hardware; application-fee recipient eligibility and accounting; merchant commercial terms/Marketplace requirements; production secrets, CSP, backup restore and deployment monitoring. These are explicit promotion gates, not claims established by fixture tests. See the architecture review's current official sources and commercialization analysis.

## Operational invariants

Use `payment status|reconcile|sweep|replay --deployment FILE --actor ID`. A trusted deployment module provides `service`, `store`, `authorizeOperator`, `audit`, optional `reconcileOther` and `close`. Actor labels are not credentials. Reconciliation retrieves money outcomes; replay only requeues a dead receipt and emits an audit event. Preserve sweep cursors for large datasets. Map non-payment operations through `reconcileOther`: invoice retrieval, Terminal reconciliation and subscription/card read-side review. Invoice/subscription/catalog/inventory webhooks are not routed through the payment receipt worker; the legacy normalizer and explicit read modules remain available. Do not claim those events automatically update owned state.

Outbox publication is at least once, with stable event IDs. Do not discard undelivered events, unknown operations or deduplication tombstones. Define retention and archival with the merchant's accounting/privacy policy; no destructive purge is bundled. Alert on unknown/expired operations, receipt dead letters, reconciliation conflicts, connection reconnect/revocation states and outbox lag. Connection HTTP audit and scheduler audit must be supplied by the host.

Optional catalog/inventory/device mutations use the existing semantic operation store with scope in their operation identity. Reuse keys for unchanged retries. A legacy store operation stuck `submitted` requires authorized inspection and its existing recovery procedure; no automatic key reset is provided. Catalog updates are full object replacements with explicit expected versions; review the complete desired object. Inventory physical counts replace observations rather than replaying decrements.

Fee policies require approval/consent references, seller environment/identity, additional-recipient permissions and eligible same-country/currency recipients. The conservative 60% ceiling limits application fees, not processing rates. Actual `processing_fee`, `app_fee_money` and allocations are preserved as provider data, including signed adjustments. Refund requests use Square's default application-fee refund treatment; custom fee-refund allocation is not offered. Reconcile refunds, disputes and payout entries for accounting; a fee quote is never a settlement ledger.

Saved-card consent requires a separate affirmative storage choice. Recurring consent also requires `{money,cadence:'MONTHLY',plan_variation_id,offer_revision}` matching the frozen order. The supported plan has one static indefinite monthly phase without discount, anchor or proration. Plan validation precedes enrollment, but catalog changes between requests cannot be atomically prevented by Square; control plan edits and reconcile resulting invoices. [Square subscription phases](https://developer.squareup.com/reference/square/objects/SubscriptionPhase) and [billing behavior](https://developer.squareup.com/docs/subscriptions-api/subscription-billing) define this boundary.

## Recorded local release checks

- `npm run validate` with PostgreSQL 14.20: 148 passed, zero failed/skipped.
- Supported Node 20/22/24: full 145-test snapshot passed on each; subsequent lifecycle/payment/connection hardening passed focused checks on each. Node 26.7.0 ran the final 148-test suite.
- Chromium/Firefox/WebKit: checkout/cart coverage includes source-free storage, duplicate submit, uncertain-state locking and explicit restart. See CI for the latest browser result.
- Sandbox gate: ten tests skipped because no live credentials/opt-in were present; zero real payment requests were made.
- Package dry run: optional source, schemas, runtime and deployment examples included. No new runtime dependency.
- CI now includes a PostgreSQL 16 service gate; local PostgreSQL evidence is version 14.20 and must not be relabeled as 16.
- Final local browser run: 30 passed. Remote PostgreSQL 16 gate passed. The first remote run exposed an inherited development dependency audit failure; `fast-uri` was patched from 3.1.6 to 3.1.8 and local audit/148-test validation passed again.

A subsequent [pre-Sandbox hardening review](square-hardening-review.md) fixes additional concurrency/recovery bugs and reduces redundant database/provider work while retaining money-movement safeguards.
