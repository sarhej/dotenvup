# Release checklist (DotEnvUp)

Use this when cutting a new release of the **VS Code/Cursor extension** (and optionally tagging the repo).

## Version number

- **Patch** (0.4.x → 0.4.x+1): Bug fixes, tests, docs, no new user-facing features.
- **Minor** (0.4.x → 0.5.0): New features (e.g. new commands, status behavior, merge flows).
- **Major** (0.x → 1.0): Breaking changes or major product shift.

Current release: **0.4.5** (patch — Partially protected, merge UX, Safe Edit edge cases + tests).

## 1. Version and changelog (already done for 0.4.5)

- Bump `packages/vscode-dotenvup/package.json` → `"version": "0.4.5"`.
- Add a `## [0.4.5] - YYYY-MM-DD` section in `packages/vscode-dotenvup/CHANGELOG.md` with Added/Fixed/Changed notes.

## 2. Build and test

From repo root:

```bash
npm run build
npm test
```

All workspace tests must pass (CLI, format, extension).

## 3. Commit all changes and tag

Commit **all** modified and new files for this release (features, tests, docs, version, changelog). Do not commit only the version bump — the tag should point at the full release.

```bash
# Add everything except .env.up (optional: add .env.up if you intend to commit it)
git add README.md docs/ packages/format/package.json packages/vscode-dotenvup/
git status   # verify; add .env.up only if you want that change in the release
git commit -m "Release v0.4.5 — Partially protected, merge flows, Safe Edit edge cases"
git tag -a v0.4.5 -m "Release v0.4.5 — Partially protected, merge flows, Safe Edit edge cases"
git push origin main
git push origin v0.4.5
```

Use the same version in the tag as in `package.json` (e.g. `v0.4.5`).

## 4. Publish extension to Marketplace

**Prerequisites:** [vsce](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) and a valid [Azure DevOps / Marketplace publisher](https://marketplace.visualstudio.com/manage) token (or login).

From repo root:

```bash
npm run publish:extension
```

This runs `npm run build` then `cd packages/vscode-dotenvup && npx @vscode/vsce publish --no-dependencies`.

- **First time:** You may need to run `npx @vscode/vsce login <publisher>` (e.g. `dotenvup`) and complete the browser token flow.
- If publish fails with "version X already exists", bump the version in `package.json` and `CHANGELOG.md` and repeat from step 1.

## 5. Publish to Open VSX Registry (VSCodium, etc.)

[Open VSX](https://open-vsx.org/) is used by VSCodium and other VS Code–compatible editors.

**Prerequisites:**

1. Create an [Eclipse account](https://accounts.eclipse.org/) and sign the [Publisher Agreement](https://open-vsx.org/) at open-vsx.org.
2. [Create a namespace](https://github.com/eclipse/openvsx/wiki/Namespace-Access) matching your `publisher` (e.g. `dotenvup`): on open-vsx.org go to your profile → Namespaces → create.
3. [Create a personal access token](https://open-vsx.org/user-settings/tokens) and set it:
   ```bash
   export OVSX_PAT=your_token_here
   ```

From repo root:

```bash
npm run publish:openvsx
```

This runs `npm run build` then `ovsx publish --no-dependencies` in the extension package. You can also pass the token explicitly: `npx ovsx publish -p $OVSX_PAT` from `packages/vscode-dotenvup`.

- First time: ensure the namespace (e.g. `dotenvup`) exists on open-vsx.org.
- If the version already exists, bump version and repeat from step 1.

## 6. GitHub release (optional)

On GitHub → Releases → Draft a new release:

- **Tag:** `v0.4.5` (select the tag you pushed).
- **Title:** `v0.4.5`
- **Description:** Paste the `## [0.4.5]` section from `CHANGELOG.md` (or a short summary).

Publishing the GitHub release is optional; the VS Code Marketplace is the main distribution.

---

**Quick copy-paste (from repo root):**

```bash
git add README.md docs/ packages/format/package.json packages/vscode-dotenvup/
git status
git commit -m "Release v0.4.5 — Partially protected, merge flows, Safe Edit edge cases"
git tag -a v0.4.5 -m "Release v0.4.5 — Partially protected, merge flows, Safe Edit edge cases"
git push origin main
git push origin v0.4.5
npm run publish:extension
npm run publish:openvsx
```
