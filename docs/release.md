# Release policy

The package remains pre-v1 and is currently installed from immutable Git tags. A tag build runs deterministic validation, produces the npm tarball and CycloneDX SBOM, attaches both to the GitHub release, and records GitHub build provenance. The repository lockfile is authoritative.

Registry publication is deferred until the adapter, catalog, event, CLI, browser, and runtime contracts complete a documented stability window. Tags must never be moved. Breaking v0.x changes require changelog and migration documentation. A v1 release requires completed sandbox evidence for supported production adapters, no open security blockers, and explicit deprecation policy.
