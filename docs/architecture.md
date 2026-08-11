# Architecture

```text
content -> Kujo Commerce validation/preparation -> Kujo SSG -> static output
             |                                      |
             + catalog + browser assets              + SiteKit presentation
static output -> browser cart -> optional Commerce runtime -> provider
static output -> hosted Link provider (no runtime)
```

Commerce is external composition, not an SSG subsystem. Build-time code reads
nested `commerce` frontmatter, validates it, copies content into an ignored work
directory, adds progressive markup, invokes the unmodified SSG, and writes the
versioned public catalog. SiteKit is used only by consumers.

When Commerce configuration is missing or `enabled: false`, the wrapper invokes
the SSG directly with no content preparation, asset contribution, catalog, or
runtime. This proves that optional installation does not alter static behavior.

The runtime uses Web Platform APIs (`Request`, `Response`, `fetch`, `crypto`) and
is portable to Workers/Pages Functions, Node-compatible edge hosts, Vercel, and
Netlify adapters. Providers remain authoritative for state. V1 has no database.

Progressive levels are catalog-only, hosted link, dynamic cart/checkout, and
verified webhook events. Sites adopt only the level they need.
