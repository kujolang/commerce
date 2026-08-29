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
