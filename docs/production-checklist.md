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
- [ ] Fulfillment depends on verified events, not the success redirect.
- [ ] Delivery failures, provider request IDs, and queue depth are monitored.
- [ ] Customer portal, refunds, payment failures, retries, and duplicate events were exercised.
- [ ] Tax, shipping, discounts, inventory, and Merchant-of-Record responsibilities were reviewed with the provider.
- [ ] Security headers, secret scanning, dependency review, and host egress policy are enabled.
- [ ] A sandbox transaction completed end-to-end before live mode was enabled.
