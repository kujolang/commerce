# Square architecture review evidence

Review date: October 7, 2026. Source baseline: `d0884c5e5ec2de5da57086ec0709d7bca34dcfee`. This records offline observations for the [architecture review](square-integration-review.md). It does not certify Square Sandbox, PostgreSQL deployment or production readiness.

## Verification results

`npm run validate` completed successfully: 66 tests, 65 passed, one skipped, zero failed. The skipped test is the optional PostgreSQL integration contract. Validation includes syntax checks, security patterns and Node tests; it does not run Playwright or credentialed Sandbox tests.

No payment requests were sent to Square. The probes below inject a fake fetch, use synthetic identifiers and never read deployment credentials. Findings remain unresolved because this change is an architecture review, not a payment implementation or remediation patch.

## Reproduce the two confirmed findings

Run from the Commerce repository with its existing development dependencies:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { providerFor } from './src/providers.mjs';

const provider = providerFor('square');
const schema = JSON.parse(await fs.readFile('schemas/event.schema.json', 'utf8'));
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

for (const [type, object] of [
  ['payment.updated', { payment: { id: 'payment-fixture', status: 'PENDING' } }],
  ['refund.updated', { refund: { id: 'refund-fixture', status: 'COMPLETED' } }],
  ['invoice.payment_made', { invoice: { id: 'invoice-fixture' } }],
  ['dispute.created', { dispute: { id: 'dispute-fixture' } }],
]) {
  const event = provider.normalizeWebhookEvent({
    event_id: 'event-fixture', type, created_at: '2026-10-07T12:00:00Z',
    data: { object },
  });
  console.log(JSON.stringify({
    input: type, normalized: event.type, schema_valid: validate(event),
  }));
}

const keys = [];
const fakeFetch = async (_url, options) => {
  keys.push(JSON.parse(options.body).idempotency_key);
  return new Response(JSON.stringify({
    payment_link: { url: 'https://square.link/u/fixture', id: 'fixture' },
  }));
};
for (const checkoutAttempt of ['a'.repeat(45) + 'x', 'a'.repeat(45) + 'y']) {
  await provider.createCheckout(
    [{ quantity: 1, provider: { catalog_object_id: 'FIXTURE' } }],
    { location_id: 'L12345678901' },
    { SQUARE_ACCESS_TOKEN: 'synthetic-not-a-secret' },
    { checkoutAttempt, fetch: fakeFetch },
  );
}
console.log(JSON.stringify({
  different_attempts_same_key: keys[0] === keys[1], key_length: keys[0].length,
}));
JS
```

Observed output:

```json
{"input":"payment.updated","normalized":"commerce.payment.updated","schema_valid":false}
{"input":"refund.updated","normalized":"commerce.refund.updated","schema_valid":false}
{"input":"invoice.payment_made","normalized":"commerce.payment.succeeded","schema_valid":false}
{"input":"dispute.created","normalized":"commerce.dispute.created","schema_valid":false}
{"different_attempts_same_key":true,"key_length":45}
```

F1 is a producer/schema inconsistency, not merely a missing future capability. F2 proves a collision in emitted request keys, not how Square would respond to a live collision. Its affected helper also handles other Square operations; the subscription runtime separately truncates its derived key. Fixes must preserve persisted keys for already-submitted operations.

## Source and scope checks

- Reviewed provider registry, Square methods, runtime handlers, operation state, durable ingress, PostgreSQL schema/claims, worker, downstream outbox, convergence, offer revisions, configuration, browser/cart, schemas, tests, compatibility and operational docs.
- Related inspected revisions: Payments `ea2f224`, Dispatch `e1bbc21`, Ability `bcbecb4`, SSG `323e5e5`, SiteKit `4a28746`, Ashford Commerce `d923676`, Revenue Desk `53db0f6`. Ashford/Revenue Desk were read-only references; their tests were not run.
- QuoteFlow's shared contract and lifecycle integration were inspected from Ashford; no standalone QuoteFlow source checkout was found in the searched local roots. No claim of an independent QuoteFlow code audit.
- GitHub issue query returned `[]` for Commerce's first 50 all-state issues.
- Official Square release index and September 16 release both corroborated API `2026-09-16`, Node SDK `46.0.0`.
- `npm view square version dist.unpackedSize dependencies engines --json` reported version `46.0.0`, unpacked size `12046575`, Node `>=18.0.0`, and dependencies `form-data`, `node-fetch`, `formdata-node`, `square-legacy`, `readable-stream`, `form-data-encoder`. Nothing was installed. This is registry metadata, not a measured deployment bundle.
- Current Marketplace overview and requirements URLs linked by Square's official requirements changelog returned 404. Historical requirements evidence was not treated as a complete current approval checklist.

## Review completion criteria

The report covers the thirteen requested deliverables, distinguishes current source from proposed modules, cites official Square sources next to platform claims, supplies a mutation retry inventory and concrete crash/Sandbox scenarios, and keeps production and commercial acceptance gates explicit. Source changes are documentation only; existing public contracts are untouched.
