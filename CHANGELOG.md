# Changelog

## Unreleased

## 0.5.0 - 2026-10-10

- Rewrite the README with monochrome badges, setup instructions, and explicit provider and optional-feature scope.

- Add optional Square OAuth connections with one-use administrator state, encrypted token custody, scoped PostgreSQL persistence, serialized refresh, location selection and disconnect/revocation handling.

- Add authenticated owned-checkout HTTP handlers, transient Square tokenization UI, native HMAC webhook verification, scoped current-state reconciliation, delayed capture/cancellation and explicit refund recovery.
- Add independent stored-card consent, durable enrollment/card lifecycle operations and opt-in approved invoice draft/publication with deposits and an exclusive collection route.

- Add opt-in owned orders, payment/refund observations, scoped PostgreSQL transactions, fenced operation claims, refund reservations and source-free unknown-payment recovery; preserve all legacy operation keys and tables.
- Add Square direct payment/refund protocol and owned hosted-checkout correlation with strict origins, bounded responses and redacted provider errors. Production promotion remains gated on live Sandbox and deployment evidence.

- Separate Square protocol code into focused client, checkout, customer, subscription and event modules while preserving existing provider exports and behavior.

- Repair Square event/schema compatibility with six additive v1 event types; payment.created now reports payment creation rather than order creation, and unknown notifications cannot imply completion.
- Allocate provider-operation UUID keys atomically when omitted, preserve stored legacy keys, bind subscription effect intent, and reject lossy Square keys instead of truncating them. Legacy unbound subscription rows fail closed pending reconciliation; see [Step 1 upgrade/report](docs/square-step1-implementation.md).

- Document the Square integration architecture review, existing provider/domain boundaries, reproducible contract/idempotency gaps, and phased Sandbox, recovery, OAuth and commercialization plan.

- Add an optional PostgreSQL 16 reference adapter with migrations, atomic webhook ingress, semantic operations, queue leases, dead letters, reconciliation cursors, transactional outbox, replay claims, consumer deduplication, and operator audit storage.
- Add a containerized receiver/worker/signed-consumer staging topology, local smoke test, and provider/infrastructure promotion runbook.
- Add bounded Node request ingestion, PostgreSQL load checks, namespaced dead letters, and a credential-gated Square subscription lifecycle Sandbox test.
- Add optional v1 contracts for immutable offer revisions, semantic provider operations, consent evidence, reconciliation, signed downstream events, and delivery attempts.
- Add deterministic durability, outbox, dead-letter, replay, reconciliation, operator, and fault-injection reference implementations without adding static-mode dependencies.
- Add Square customer lookup/creation, saved-card workflow, direct subscription enrollment/retrieval, scheduled cancellation, pause/resume, subscription reconciliation, expanded events, strict endpoint selection, and API version `2026-09-16`.
- Expand provider capabilities without changing existing v1 meanings, and add production-backend/reference-deployment guidance and bounded benchmarks.

### Square operational and optional modules

- Added bounded reconciliation sweeps, audited dead-letter replay, at-least-once outbox publication and authenticated deployment-based payment CLI commands.
- Added disabled-by-default application-fee policy/allocation support and provider-returned fee accounting, plus optional one-way catalog/inventory, device/Terminal and read-only dispute/payout modules.
- Bound recurring consent to approved money/revision/plan and checked static monthly provider pricing; tightened invoice ownership, collection route exclusion, terminal cancellation audit and unknown-payment cancellation rules.
- Resolve OAuth credentials per request, bound location discovery time/body limits, reject invalid token expiry, and preserve scoped encrypted refresh behavior.
- Added explicit checkout restart after confirmed failure/cancellation, generated-record schema checks, operator/worker examples and credential-gated Sandbox payment tests. All legacy provider keys and v1 tables remain unchanged.
- Updated the development-only `fast-uri` lockfile entry from 3.1.6 to 3.1.8 to clear the inherited dependency-audit failures; `npm audit` reports zero vulnerabilities.

### Square pre-Sandbox hardening

- Avoid unchanged PostgreSQL aggregate writes and add a partial pending-outbox index, preserving transactional locks, receipt completion and audit behavior.
- Reuse known webhook payment mappings before fetching a Square Order; handle stale retry leases without affecting their replacement worker.
- Keep sweeps running after an optional reconciler fails and reject invalid batch limits before I/O.
- Preserve verified payment/refund observations when a late API failure arrives; conflicting outcomes remain unknown until reconciled.
- Reject malformed stored OAuth expiry and fence delayed location selection against newer connection generations.
- Prevent payment submission after browser checkout teardown and serialize checkout restart against tokenization and other restarts.

## 0.4.0 - 2026-08-30

- Freeze the v1 wire contracts and publish the post-1.0 compatibility and
  deprecation policy.
- Add authenticated customer-portal and PayPal return/capture HTTP flows plus
  provider-wide portal coverage.
- Add pluggable checkout/completion/portal rate limiting and runtime adapter
  contract tests for Cloudflare, Vercel, Netlify, and Node.
- Expand browser coverage to Chromium, Firefox, and WebKit with keyboard,
  status/alert, variant, failure, portal, and completion exercises.
- Make zero-runtime Static Mode the default initializer, add a copyable hosted-
  link storefront, and add a GitHub Pages deployment workflow.

## 0.3.0 - 2026-08-29

- Replace provider branches with a versioned adapter registry and reusable
  conformance suite; add PayPal, Square, Paddle, and Lemon Squeezy adapters.
- Add exact structured money, product/variant/SKU separation, route overrides,
  generic static generation, Web Components, and expanded JSON Schemas.
- Harden DOM rendering, redirects, request bounds, provider timeouts/errors,
  webhook secret handling, deduplication, event sinks, and deferred delivery.
- Add canonical YAML/JSON config loading, `init`, `doctor`, `providers`, JSON CLI
  output, portable runtime adapters, browser E2E, schema tests, threat model,
  production checklist, migration guide, and security policy.

## 0.2.0 - 2026-08-11

- Add a tested cart state module, complete hosted-checkout options, idempotent
  attempts, customer portal sessions, stricter capability enforcement, and safer
  webhook normalization.
- Emit active provider identifiers in the safe catalog so edge checkout resolves
  trusted SKUs without browser-supplied provider data.
- Delegate directly to unmodified SSG behavior when Commerce is missing or
  disabled.
- Load the browser entrypoint as an ES module.

## 0.1.3 - 2026-08-11

- Persist cart quantity input immediately without disrupting input focus.

## 0.1.2 - 2026-08-11

- Remove internal composition markers from SSG-derived listing excerpts.

## 0.1.1 - 2026-08-11

- Compose Commerce UI and Product JSON-LD after SSG rendering so the SSG can
  retain its safe raw-HTML escaping behavior.

## 0.1.0 - 2026-08-11

- Initial provider-agnostic build pipeline, cart, checkout/webhook runtime,
  Stripe, Polar, Link, and Mock providers, schemas, tests, and documentation.
