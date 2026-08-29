# Changelog

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
