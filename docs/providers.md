# Providers

Adapters declare capabilities and own configuration/product validation, public serialization, remote verification, checkout, portal, webhook verification, and normalization. Core contains no provider-name checkout branches. Third parties can register an adapter with `createProviderRegistry()` and run `assertProviderConformance()`.

| Provider | Checkout | Multi-item | Quantity | Subscription | Physical | Portal | Webhooks | Sandbox E2E |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Stripe | Checkout Session or explicit hosted link | yes | yes | yes | yes | yes | yes | credential-gated |
| Polar | Checkout Session or explicit hosted link | no | no | yes | no | yes | yes | credential-gated |
| PayPal | Orders/Billing approval plus server capture | one-time | yes | one plan | yes | no | yes | credential-gated |
| Square | Payment Link backed by catalog order | yes | yes | no in this adapter | yes | no | yes | credential-gated |
| Paddle | Transaction hosted checkout | yes | yes | yes | no | yes | yes | credential-gated |
| Lemon Squeezy | One-variant checkout | no | no | yes | no | verified URL | yes | credential-gated |
| Link | Configured hosted URL | no | no | delegated | delegated | no | no | HEAD check |
| Mock | visibly simulated | yes | yes | yes | yes | simulated | signed fixture | deterministic |

Link delegates semantics to its configured destination. Mock can never create a real transaction. Merchant-of-Record is declared for Polar, Paddle, and Lemon Squeezy, but legal/tax applicability still depends on the provider account and product.

`verify` is explicit and read-only. Builds never call provider APIs. Credential-gated sandbox tests skip when their environment is absent; fixture tests always verify request/signature/normalization contracts.

Current first-party references:

- [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create) and [webhook signatures](https://docs.stripe.com/webhooks/signature)
- [Polar Checkout API](https://polar.sh/docs/api-reference/checkouts/create-session) and [webhooks](https://polar.sh/docs/integrate/webhooks)
- [PayPal Orders v2](https://developer.paypal.com/docs/api/orders/v2/) and [webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/)
- [Square CreatePaymentLink](https://developer.squareup.com/reference/square/checkout-api/create-payment-link) and [signature validation](https://developer.squareup.com/docs/webhooks/step3validate)
- [Paddle transactions](https://developer.paddle.com/api-reference/transactions/create-transaction) and [signature verification](https://developer.paddle.com/webhooks/signature-verification)
- [Lemon Squeezy checkouts](https://docs.lemonsqueezy.com/api/checkouts/create-checkout) and [signed webhooks](https://docs.lemonsqueezy.com/guides/developer-guide/webhooks)
