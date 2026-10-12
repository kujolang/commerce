# Release policy

The package remains pre-v1. A tag build runs deterministic validation, produces
the npm tarball and CycloneDX SBOM, attaches both to the GitHub release, and
records GitHub build provenance. The repository lockfile is authoritative.

Releases publish publicly as `@kujolang/commerce`. The tag workflow publishes
its verified tarball to npm using trusted publishing. Configure the npm
publisher relationship for `kujolang/commerce`, workflow `release.yml`, and
environment `npm` before running it. See [Publishing Commerce](RELEASING.md)
for setup, existing-tag recovery, and the authenticated local fallback.

Tags must never be moved. Breaking v0.x changes require changelog and migration
documentation. A v1 release requires completed sandbox evidence for advertised
production adapters, no open security blockers, and the published deprecation
policy.
