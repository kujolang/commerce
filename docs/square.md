# Square

Configure an access token and `location_id`, then map one-time purchasables to a Square `catalog_object_id`. The adapter calls `CreatePaymentLink` with an idempotency key and a catalog-backed order. Square remains authoritative for payment execution; the reviewed local catalog remains authoritative for the intended SKU and provider mapping.

Subscription products use a trusted `plan_variation_id`, `cadence: monthly`, an authenticated/reconciled Square customer, a saved card ID, explicit consent evidence, and `createSubscription()`. The adapter pins Square API version `2026-09-16`, defaults to `https://connect.squareupsandbox.com`, and only accepts the official sandbox or production API origin. This release capability-declares static recurring prices only; relative/itemized phases require additional order-template input and remain false. Commerce never turns browser-authored amounts or plan IDs into provider requests.

Customer reconciliation uses exact email or reference-ID search. No match may be created by an application through `createCustomer()`; multiple matches fail with `ambiguous_customer` and require operator resolution. `createSavedPaymentMethod()` accepts a single-use token from Square's Web Payments SDK, immediately sends it to the Cards API, and returns only non-sensitive card metadata. Commerce must never persist the token. Applications must provide their own reviewed, unambiguous consent text; recurring authorization cannot be preselected.

The adapter retrieves subscriptions, schedules end-of-cycle cancellation, and supports Square pause/resume. Pause and some related actions are currently marked Beta by Square, so deployments should exercise them in Sandbox and monitor Square release notes. Direct reconciliation currently supports subscriptions. Immediate cancellation is not declared.

Relevant Square references: [Subscriptions API](https://developer.squareup.com/reference/square/subscriptions-api), [Create subscription](https://developer.squareup.com/reference/square/subscriptions-api/create-subscription), [Cards API](https://developer.squareup.com/docs/cards-api/overview), [customer search](https://developer.squareup.com/docs/customers-api/use-the-api/search-customers), and [pause/resume/cancel](https://developer.squareup.com/docs/subscriptions-api/pause-resume-cancel-subscriptions).

Webhook verification requires the exact public `notification_url` and subscription signature key because Square signs `notification_url + raw_body` with HMAC-SHA256.
