# Owned payments deployment boundary

This is a single-owner **Sandbox** operator deployment. Install the package and `pg`, provide the server-only environment variables listed in `deployment.mjs`, then run:

```sh
node bin/kujo-commerce.mjs payment status --deployment examples/owned-payments/deployment.mjs --actor "$COMMERCE_OPERATOR" --order ORDER
node bin/kujo-commerce.mjs payment sweep --deployment examples/owned-payments/deployment.mjs --actor "$COMMERCE_OPERATOR"
node examples/owned-payments/worker.mjs
```

The example relies on an authenticated, restricted OS account. `--actor` is an audit identity, not authentication. Do not expose this CLI or deployment module as a remote command endpoint. Send stderr audit records to durable protected logging. The worker is a bounded one-shot process; schedule it and retain sweep cursors between invocations for large stores. Add an authenticated downstream publisher through `publishPaymentOutbox`; consumers must deduplicate event IDs.

For web checkout, create `createPaymentHandlers` from `@kujolang/commerce/runtime/payments`. Supply your session authorization, shared rate limiter, HTTPS origin, public Square application ID and server-priced `resolveOrder`. Route its `session`, `pay`, `status`, and optional explicit `restart` handlers through your Fetch-compatible server. Map operators separately to `refund`, `capture`, `cancel`, and `reconcile`. Attach `mountSquareCheckout` to a form/card container/button/status element with those same-origin endpoint URLs. Use its `restart()` only after a confirmed failed/canceled payment; it cannot unblock an unknown result.

Mount `createSquarePaymentWebhook` with the exact registered notification URL and secret. Raw bytes must reach the handler unchanged. Run the receipt worker even when checkout requests succeed. For OAuth, replace the personal-token service with `createConnectedPaymentService`; it resolves current credentials before every provider call.

Keep card sources, OAuth codes, tokens and raw webhook bodies out of reverse-proxy/APM request logs. Set CSP using the current Square Web Payments SDK guide, permit only the selected Sandbox or production SDK, and test actual SCA in the merchant's environment. This example does not supply your login, taxes, fulfillment, consent copy, commercial approval, backups or live provider acceptance.
