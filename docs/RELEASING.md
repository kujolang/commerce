# Publishing Commerce

Tagged releases run validation, create the tarball and SBOM, attest the tarball, attach the artifacts to GitHub, and publish that same tarball to npm.

Configure npm trusted publishing for `kujolang/commerce`, workflow `release.yml`, GitHub environment `npm`. The workflow uses OIDC and does not need a stored npm token.

For a GitHub release that was created before npm publishing was added, run the **Release artifacts** workflow from `main` with its existing tag (for example `v0.5.0`). This checks out the tag and verifies that its version and commit match before publishing. Do not move existing release tags. A version already present on npm cannot be republished.

Local fallback after authenticating with `npm login --auth-type=web`:

```bash
npm ci
npm run validate
npm pack
npm publish kujolang-commerce-0.5.0.tgz --ignore-scripts --access public --provenance=false
npm view @kujolang/commerce@0.5.0 version
```

Local publishing cannot produce GitHub Actions OIDC provenance. Prefer the workflow when trusted publishing is configured.
