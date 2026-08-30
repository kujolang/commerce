# Release policy

The package remains pre-v1. A tag build runs deterministic validation, produces
the npm tarball and CycloneDX SBOM, attaches both to the GitHub release, and
records GitHub build provenance. The repository lockfile is authoritative.

Starting with 0.4.0, releases are published publicly as
`@kujolang/commerce`. The first scoped publication uses an authenticated npm
maintainer with two-factor authentication and `npm publish --access public`.
Subsequent releases should use npm trusted publishing from the tag workflow once
the package's trusted-publisher relationship is configured.

Tags must never be moved. Breaking v0.x changes require changelog and migration
documentation. A v1 release requires completed sandbox evidence for advertised
production adapters, no open security blockers, and the published deprecation
policy.
