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
Netlify adapters. Providers remain authoritative for state. Core has no database;
durable event deduplication and queues are optional interfaces.

Progressive levels are catalog-only, hosted link, dynamic cart/checkout, and
verified webhook events. Sites adopt only the level they need.

Provider adapters are the only layer that understands provider API shapes. Core
selects the adapter, validates declared capabilities, and invokes its contract.
The generic static adapter emits assets/catalog without SSG assumptions, while
the Kujo SSG adapter owns only deterministic composition around SSG routing and
rendering.

The current SSG adapter uses exact, namespaced paragraph placeholders because
Kujo SSG deliberately escapes arbitrary Markdown HTML and has no extension hook.
Commerce replaces only its exact placeholders and appends its own Product JSON-LD;
it does not regex-rewrite SSG-owned structured data or unrelated HTML. A future
SSG adapter hook can replace this narrow contract without changing Core.
