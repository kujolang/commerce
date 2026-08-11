# SSG integration audit

Audit date: 2026-08-11. Audited current local/upstream `kujolang/ssg` main,
`kujolang/site-kit` main, and Kujo v1 conventions before implementation.

SSG's `build.kujo` discovers YAML/JSON config, recursively finds pages/posts and
custom collections, preserves unknown nested YAML metadata, supports template
and asset directory overrides, creates deterministic output, and accepts explicit
content/assets/templates/output paths. It deletes output at build start, copies
assets, renders collection routes and listing pages, and finishes with auxiliary
feeds/sitemap/robots/llms output. Contracts cover CLI precedence, generated
output, docs starter, and release validation. It has no plugin API or build
manifest intended for third-party emitted files.

SiteKit v1's supported consumer artifact is `dist/`, including `sitekit.css`,
optional `sitekit.js`, fonts, and licenses. Commerce does not depend on it.

## Decision

No SSG change is necessary. External composition is smaller than a generic hook:
Commerce prepares an ignored content/assets view, invokes existing public CLI
path overrides, then emits its catalog into final output. This satisfies content
inspection, asset contribution, generated files, and templates without changing
SSG semantics. A hook framework was rejected because the first consumer did not
prove it necessary. SSG continues to own static parsing/rendering/routing/SEO;
Commerce owns validation, product semantics, catalog, cart, providers, runtime,
and commerce structured data. Commerce absent or disabled leaves SSG unchanged.
