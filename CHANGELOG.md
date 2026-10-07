# Changelog

## Unreleased

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
