# Compatibility and deprecation policy

## Frozen v1 wire contracts

As of 0.4.0, `kujo-commerce/v1`, `kujo-cart/v1`,
`kujo-commerce-event/v1`, the v1 JSON Schemas, exact-money representation,
provider capability names, and checkout request/response fields are frozen.
Changes to these contracts may only add optional fields or new event enum values
until a separately named v2 contract exists. Existing v1 fields will not change
meaning.

The package remains pre-1.0 until credentialed sandbox runs and a deployed
durable webhook store/queue have independent evidence. Those release gates do
not permit incompatible changes to the frozen v1 wire contracts.

## Supported runtimes

Node 20, 22, and 24 are tested. Browser behavior is tested in current Chromium,
Firefox, and WebKit. Cloudflare Pages/Workers use the standards-based adapter;
Vercel's Node request/response bridge, Netlify's standards Request adapter, and
the direct Node bridge have deterministic contract tests.

## Deprecations after 1.0

Public JavaScript exports and configuration fields will be announced as
deprecated in the changelog and documentation before removal. Removal occurs in
the next major release, never a patch or minor release. Security-sensitive
behavior may be disabled sooner when retaining it would create an active risk;
that exception will be documented with migration guidance.

Provider API versions can move independently when a provider retires an old
version. Commerce will pin an explicit version where the provider supports it,
document the provider deadline, and keep the public Commerce v1 contract stable.

## Release evidence

Every release runs unit, schema, provider-conformance, runtime-adapter, and
three-engine browser suites. Credentialed sandbox suites are separate and skip
only when their named secrets are absent. Release notes must identify any new
optional field, provider API-version change, or deprecation.
