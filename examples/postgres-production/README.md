# PostgreSQL production topology

This reference uses PostgreSQL for semantic operation records, immutable offer revisions, atomic webhook receipt-plus-enqueue, reclaimable queue leases, dead letters, reconciliation cursors, a transactional downstream outbox, replay claims, consumer deduplication, and operator audit records. Static and hosted-link deployments do not load this adapter.

PostgreSQL is both the system of durable record for Commerce processing and the durable work queue. `FOR UPDATE SKIP LOCKED` permits competing workers without adding a second infrastructure product. Move to a managed queue later by implementing the same `DurableQueue` interface; do not split the webhook receipt and enqueue transaction without a transactional handoff.

## Local staging proof

Copy `.env.example` to an ignored `.env` and replace every value with a random local value. Then run:

```sh
docker compose --env-file examples/postgres-production/.env \
  -f examples/postgres-production/compose.yml up --build -d

set -a
. examples/postgres-production/.env
set +a
node examples/postgres-production/staging-smoke.mjs
```

The smoke test sends a signed Mock webhook twice, expects `202` then `200`, waits for the durable worker and signed consumer, verifies one downstream fact, and verifies that the receipt reached `processed`. Mock proves topology behavior only; it is not Square Sandbox evidence.

The database accepts either `COMMERCE_DATABASE_URL` or standard `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` variables. Compose uses the separate variables so generated passwords do not need URL encoding.

Stop the local environment with `docker compose ... down`. Add `--volumes` only when intentionally deleting the local verification database.

## Square Sandbox promotion

Set `COMMERCE_PROVIDER=square`; provide `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_NOTIFICATION_URL`, and Square's webhook signature key as `COMMERCE_WEBHOOK_SECRET`; use `https://connect.squareupsandbox.com`. Expose the receiver through an HTTPS staging hostname matching `SQUARE_NOTIFICATION_URL`. Do not use HTTP outside the private Compose network. Run subscription creation with an application-authenticated customer/card/consent resolver, then exercise the checklist in `docs/staging-runbook.md`.

## Operations

- Run `migrate.mjs` once per release before starting workers.
- Scale workers horizontally; row locks prevent concurrent lease ownership.
- Alert on old ready jobs, expired leases, dead letters, unknown operation outcomes, reconciliation drift, and outbox age.
- Back up the database with encrypted managed snapshots and periodic `pg_dump`; test restoring to a separate database.
- Rotate downstream signing keys with current and previous IDs during the overlap window.
- Keep `COMMERCE_ARCHIVE_RAW_EVENTS=false` unless an approved encrypted retention policy exists.
- Put receiver and consumer behind HTTPS, a request-size limit, rate controls, and restricted operator-network access.

The example operator endpoints are deliberately small. They require one bearer token and write replay audit records, but a real deployment should replace the shared token with its identity and role system.
