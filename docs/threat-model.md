# Threat model

## Assets and boundaries

Secrets and authoritative commerce state live at providers/deployment secret stores. The static catalog contains only public product/provider identifiers. The browser, network clients, product source, generated output, provider responses, and webhook senders cross trust boundaries. The build host and reviewed deployment artifact are trusted.

## Threats and controls

| Threat | Control | Residual responsibility |
| --- | --- | --- |
| Price/provider-ID/SKU tampering | Runtime resolves SKU against trusted catalog and ignores browser price fields | Deploy catalog and runtime atomically |
| Quantity/cart abuse | Type, count, duplicate, min/max, availability, and provider capability checks | Infrastructure rate limits |
| XSS/catalog injection | Browser uses DOM creation and `textContent`; JSON-LD escapes `<`; URLs are validated | Sanitize unrelated theme/templates |
| Unsafe redirects | HTTPS URL validation, credential rejection, generic public errors | Restrict provider domains where contract permits |
| Webhook spoofing/replay | Raw-body signatures, timestamp windows, fail-closed secrets, event-ID store | Durable atomic store and queue |
| Slow/failed fulfillment | Queue/sink abstraction and host `waitUntil` | Monitor and retry downstream delivery |
| SSRF | Provider API origins are fixed or constrained to official origins; Link verification is explicit | Treat merchant-configured Link destinations as trusted config |
| Secret/provider error leakage | Secrets stay in env; public errors are generic; diagnostic hook is structured | Secure logs and access controls |
| Resource exhaustion | Body/item/quantity bounds and provider timeouts | Edge rate limiting and concurrency limits |
| Path traversal | Output/content roots are resolved and generated filenames are fixed | Protect build configuration review boundary |
| Supply-chain compromise | Lockfile, minimal runtime dependency, CI audit/CodeQL/secret scan | Signed releases/provenance remain pre-v1 work |

Unknown normalized events never silently become fulfillment events. The system does not promise protection from a compromised provider account, build host, deployment secret store, or merchant-authored runtime sink.

## Owned payments and optional connections

The server order resolver, administrator authorization callback, tenant-to-provider customer mapping and deployment secret manager are trusted. The browser, OAuth callback parameters, raw webhook input, external provider objects and concurrent workers are untrusted. PostgreSQL and the vault key service are separate credential boundaries.

| Threat | Implemented boundary | Deployment condition |
| --- | --- | --- |
| Cross-merchant collection or token reuse | Six-part scope, environment/location validation, OAuth seller binding, live token resolver | Authorize the merchant before constructing a service; use `createConnectedPaymentService` for OAuth |
| Duplicate money movement after an ambiguous response | Persisted immutable operation key and intent; unknown outcomes block fresh attempts and local cancellation | Retain keys and operation history; never “repair” by regenerating keys |
| Stale worker overwrites a recovered result | Generation/token fences; aggregate/receipt/outbox commit in one transaction | Shared PostgreSQL for every worker; memory adapter is test-only |
| Invoice/Terminal/card double collection | Exclusive order collection route | Dashboard changes still require scheduled retrieval; never fulfill from redirects |
| OAuth CSRF/replay and token theft | Actor-bound hashed one-use state, encrypted tokens with scoped AAD, serialized refresh | Protect keyring separately, rate-limit callbacks and never log query codes |
| Unauthorized refunds, device actions or fees | Operator permissions; authorized device resolver; explicit disabled-by-default fee policy | Host callbacks must validate actual identity and approval evidence, not merely accept an ID |
| Subscription charges beyond buyer consent | Consent binds order revision, amount, monthly cadence and plan; remote static price check | Freeze/manage plan changes; Square has no atomic catalog-version precondition on enrollment |
| Webhook spoofing or stale delivery | Native HMAC verification, persisted event IDs, retrieve-current-state reducer | Retain receipt tombstones; a signed replay never authorizes another charge |
| Leakage through diagnostics | Small allowlisted durable results; transient sources; encrypted credentials; generic HTTP errors | Disable request-body capture in proxy/APM; trusted callbacks must follow the same rule |

Review includes operation entry points, scope checks, token lifecycle, money/version validation, receipt fencing, browser boundaries and source-free persistence. Regression tests exercise these boundaries; this is not an independent penetration test or PCI certification. The package does not protect against compromised host authorization, database administration, vault keys or Square accounts.
