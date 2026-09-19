# Production checklist

- [ ] Exact Commerce version/commit and lockfile are deployed.
- [ ] Test and live provider applications cannot be confused.
- [ ] Credentials are deployment secrets; `verify` passes against intended products.
- [ ] Product amount, currency, recurrence, availability, and provider IDs were reviewed.
- [ ] Checkout, cancel, return, portal, and webhook URLs use HTTPS.
- [ ] Exact allowed origins and infrastructure rate limits are configured.
- [ ] Provider API versions and request timeout are explicit.
- [ ] Webhook secret/PayPal webhook ID is configured and invalid signatures fail closed.
- [ ] Durable atomic event deduplication and reliable queue/sink are deployed.
- [ ] Semantic operations are persisted before provider mutations and unknown outcomes are reconciled.
- [ ] Published offer revisions are immutable and retained for active/historical purchases.
- [ ] Subscription consent evidence records reviewed text/terms versions and explicit opt-in.
- [ ] Queue leases, retry bounds, dead-letter inspection, replay authorization, and audit records were exercised.
- [ ] Reconciliation cursors are durable, scans overlap, pagination is bounded, and repair policy is explicit.
- [ ] Downstream signing keys have IDs, overlap during rotation, replay storage, and clock monitoring.
- [ ] Fulfillment depends on verified events, not the success redirect.
- [ ] Delivery failures, provider request IDs, and queue depth are monitored.
- [ ] Customer portal, refunds, payment failures, retries, and duplicate events were exercised.
- [ ] Tax, shipping, discounts, inventory, and Merchant-of-Record responsibilities were reviewed with the provider.
- [ ] Security headers, secret scanning, dependency review, and host egress policy are enabled.
- [ ] A sandbox transaction completed end-to-end before live mode was enabled.

Mock deployments may mark the checkout, cancel, return, portal, browser matrix,
runtime adapter, and accessibility exercises complete. They do not satisfy the
credentialed sandbox, durable webhook store/queue, or live-mode gates.
