# Discovery and compatibility map

## Observed baseline

The repository already had eight first-party adapters: Stripe, Polar, PayPal, Square, Paddle, Lemon Squeezy, Link, and Mock. It had product/variant validation, exact money, deterministic static output, hosted links, browser custom elements, trusted SKU/quantity checkout resolution, Node/Cloudflare/Netlify/Vercel bridges, explicit capability declarations, raw-body webhook verification and v1 normalization, optional in-memory deduplication plus sink/queue shapes, provider conformance, Static Mode, and hybrid examples. The pre-change deterministic suite contained 52 passing tests.

The Square adapter used catalog-backed Payment Links for one-time checkout. It did not support Customers, Cards, or Subscriptions APIs; subscription capability was false. Existing event delivery could deduplicate within one process but did not model leases, dead letters, replay, reconciliation, semantic-operation recovery, consent evidence, immutable offers, or signed downstream delivery.

## Placement decisions

- Core: focused v1 contracts, immutable revision hashing, semantic idempotency state machine, convergence, signing, durability interfaces, in-memory conformance fixtures, and operator service.
- Providers: Square API version/origins, customers, cards, subscriptions, lifecycle operations, webhook mapping, and retrieval.
- Runtime: authenticated subscription enrollment and durable webhook composition.
- Persistence: optional interfaces and deterministic memory fixtures; no production database dependency in the base package.
- Examples: progressive host-neutral composition with deployer-supplied durable adapters.
- Tests: provider request fixtures, injection rejection, unknown outcomes, leases, retry/dead-letter/replay, stale convergence, signatures, and benchmarks.

## Compatibility decisions

Catalog, cart, checkout, and normalized-event v1 meanings remain unchanged. New product fields and provider capability booleans are additive. Existing runtime entry points and browser data attributes remain available. Static builds do not import or initialize advanced stores and never contact providers.

Square plan variation IDs are present only in the trusted generated catalog and are selected by SKU server-side; a browser-supplied provider ID or amount is ignored. Direct subscription enrollment is a separate authenticated route rather than changing one-time checkout semantics.

## Material deviations

- Directive: add SQLite and/or PostgreSQL reference implementations if they fit cleanly. Reality: the package supports Node 20 and edge runtimes with one runtime dependency; a built-in SQLite implementation would either require a native dependency or raise the Node floor, and PostgreSQL would choose a client. Replacement: stable adapter behavior plus deterministic conformance fixtures and deployment injection. Tradeoff: deployers supply storage; static users keep zero database weight. Compatibility impact: none.
- Directive: add reconcile/replay/migrate CLI commands where stable. Reality: those mutations require application-owned adapter discovery, authorization, audit, and deployment secrets. Replacement: programmatic operator/reconciliation/replay contracts. Tradeoff: no unsafe generic CLI mutation; a future versioned deployment-adapter manifest can enable commands. Compatibility impact: none.
- Directive: production reference deployments across all hosts. Reality: each host has different durable services. Replacement: one complete host-neutral composition and existing request bridges, with explicit persistence/queue boundaries. Tradeoff: no misleading in-memory “production” sample or duplicated business logic. Compatibility impact: none.
- Directive: Square pause/resume only when verified. Current Square documentation exposes both endpoints; pause and some subscription actions are Beta. Replacement: capability-declare pause/resume, document Beta status, and require Sandbox evidence before production use. Immediate cancellation remains false because Square cancellation is scheduled for the end of the active cycle.
