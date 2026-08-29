# Security policy

## Supported versions

Security fixes are applied to the latest tagged v0.x release and `main`. Before v1, older minor releases may require upgrading rather than backports.

Report suspected vulnerabilities privately through GitHub Security Advisories for `kujolang/commerce`. Do not open a public issue containing exploit details, provider identifiers, credentials, webhook payloads, or customer data. Include affected version, reproduction, impact, and a safe contact address. Maintainers will acknowledge, triage, coordinate a fix, and credit reporters who want attribution.

## Operating model

The browser is untrusted. Never accept browser prices, totals, provider IDs, tax, discounts, or shipping rates. Deploy the catalog and runtime from the same reviewed build. Store provider credentials and webhook secrets only in the deployment platform's secret store. Use separate test/live applications and rotate any credential that entered source control or logs.

Production webhook endpoints must have a real provider secret (or PayPal webhook ID and API credentials), durable deduplication, a queue or reliable event sink, bounded bodies, and monitored failures. The in-memory store is for tests and single-process development only. Fulfillment must follow a verified provider event, never a success redirect.

Configure exact allowed origins and infrastructure rate limits for dynamic checkout. Use HTTPS for every production URL, restrict egress where the host permits it, preserve raw webhook bodies, and keep provider diagnostics out of public responses. See [threat model](docs/threat-model.md) and [production checklist](docs/production-checklist.md).
