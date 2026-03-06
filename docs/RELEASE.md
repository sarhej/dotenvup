# Release checklist (DotEnvUp)

Follow this before every publish. Do not publish if any required item is unchecked.

## 1. Choose the version

- [ ] Pick the right bump:
  - patch = bug fixes, docs, tests, no meaningful user-facing feature
  - minor = new commands, new workflows, new package, new store-visible feature
  - major = breaking format or workflow change
- [ ] Use the same version everywhere that ships together:
  - `packages/vscode-dotenvup/package.json`
  - website version mentions (`docs/index.html`, JSON-LD `softwareVersion`)
  - Git tag and GitHub release title

## 2. Update release notes and public surfaces

- [ ] Update `packages/vscode-dotenvup/CHANGELOG.md` with a new top section for the release.
- [ ] Verify the extension README in `packages/vscode-dotenvup/README.md` matches the actual commands and behavior shown in the stores.
- [ ] Verify root docs (`README.md`, `docs/SECURITY.md`, `docs/USER_GUIDE.md`, `docs/FORMAT_SPEC.md`) match the shipped behavior if anything changed.
- [ ] Update website copy in `docs/index.html` if install steps, feature set, or version changed.
- [ ] Prepare the GitHub release body from the same release summary used in the changelog.

## 3. Security and release hygiene

- [ ] Confirm no plaintext secrets are staged:
  - `.env`
  - `.env.*`
  - key bundles, private keys, credentials, tokens
- [ ] Confirm `.env.up` is staged only if intentionally part of the release.
- [ ] Delete temp/editor junk before publish (for example `.!*`, backup junk, accidental exports).
- [ ] Re-read `docs/SECURITY.md` and confirm it still describes the current implementation.
- [ ] Verify any new crypto/share flow has tests for:
  - roundtrip success
  - wrong-key failure
  - malformed/tampered input failure if applicable
  - no secret leakage in logs or tool responses

## 4. Build and test gates

From repo root:

```bash
npm run release:verify
```

- [ ] `npm run release:verify` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes from the repo root.
- [ ] Every workspace that participates in the monorepo test run has a `test` script.
- [ ] Run targeted smoke tests for new features, especially security-sensitive ones.
- [ ] If Semgrep is installed locally, run `npm run release:verify:full`.

### CI release gate

- [ ] The GitHub `Extension` workflow is green for:
  - `Release verify`
  - `Semgrep (SAST)`
  - `OpenSSF Scorecard`
  - `CodeQL (SAST)`
- [ ] Do not attach/package/publish the extension unless those jobs pass.

### Required manual smoke tests for extension releases

- [ ] Lock / Unlock `.env.up`
- [ ] Import `.env` -> `.env.up`
- [ ] Recipient flow (`Copy My Public Key` + `Encrypt for Recipient`)
- [ ] GitHub recipient flow if touched
- [ ] Safe Edit if touched
- [ ] MCP config copy if touched
- [ ] Receive/decrypt share flows if touched

## 5. Git worktree must be release-shaped

- [ ] `git status` is understood.
- [ ] Only intended release files are included.
- [ ] No unrelated local experiments are mixed into the release tag.
- [ ] Commit message and tag message match the release contents.

Suggested sequence:

```bash
git status
git add README.md docs/ packages/
git status
git commit -m "Release vX.Y.Z - short summary"
git tag -a vX.Y.Z -m "Release vX.Y.Z - short summary"
git push origin main
git push origin vX.Y.Z
```

## 6. Publish to stores

### VS Code Marketplace

- [ ] Publisher login/token is valid.
- [ ] Run:

```bash
npm run publish:extension
```

This command now runs `npm run release:verify` automatically before publish.

### Open VSX

- [ ] Namespace/token is valid.
- [ ] Run:

```bash
npm run publish:openvsx
```

This command now runs `npm run release:verify` automatically before publish.

## 7. Publish GitHub release

- [ ] Draft GitHub release for tag `vX.Y.Z`.
- [ ] Title is `vX.Y.Z`.
- [ ] Body matches the changelog summary.
- [ ] Attach `.vsix` or other shipped artifacts if used for distribution.

## 8. Post-publish verification

- [ ] Marketplace page shows the new version and updated README/changelog.
- [ ] Open VSX shows the new version.
- [ ] `docs/index.html` deployed version matches the shipped release.
- [ ] Install from Marketplace/Open VSX/VSIX works.
- [ ] GitHub release page is live and links are correct.
