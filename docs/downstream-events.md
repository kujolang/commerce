# Signed downstream events

`signDownstreamEvent()` signs the timestamp, key ID, and exact provider-neutral event with HMAC-SHA256. `verifyDownstreamEvent()` enforces the signature, time tolerance, active/previous key lookup, and optional durable replay claim. Publish through a transactional outbox, retry transient consumer failures, and dead-letter terminal deliveries. Consumers must deduplicate `event_id` and only advance an aggregate when `aggregate_version` is newer. Commerce supplies billing facts; the consumer owns authorization and fulfillment.
