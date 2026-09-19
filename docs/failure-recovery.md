# Failure recovery runbook

- Lost provider response: mark unknown, retrieve/search provider state, record recovered success, or safely retry with the original provider idempotency key.
- Duplicate/out-of-order webhook: claim by provider event ID, then retrieve current state when ordering matters; never move a versioned aggregate backward.
- Worker crash: let the lease expire and reclaim it. Commit side effects idempotently before marking processed.
- Consumer outage: retain the outbox record, apply bounded backoff, dead-letter at the configured limit, then authorize replay.
- Missed provider event: run a bounded, overlapping reconciliation scan from the persisted watermark.
- Signing failure: verify clock synchronization and current/previous key IDs; never bypass replay or signature checks.
