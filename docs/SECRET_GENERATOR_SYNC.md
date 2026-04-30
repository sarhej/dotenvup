# `@dotenvup/secret-generator` — cross-repo sync (mandatory)

**Canonical open-source package:** `sarhej/dotenvup` → `packages/secret-generator`

**UnknownPassword mirror + vendor bundle:** `sarhej/unknownpassword` → `packages/secret-generator` and `site/app/vendor/dotenvup-secret-generator.js` (built output for CSP).

This page is duplicated in both repos (same procedure). Edit **both copies** when this workflow changes.

---

## Duty (Cursor agents and humans)

On **every** change that touches password/passphrase generation, the wordlist, crypto helpers, package API, tests, or vendoring:

1. **Treat this repo (DotEnvUp) as source of truth for the npm package.** Implement changes in `packages/secret-generator` here first.
2. **Mirror into UnknownPassword** the same package tree (`src/`, `test/`, `data/`, `package.json`, `LICENSE`, `README.md`) so its `packages/secret-generator` matches.
3. **In UnknownPassword**, regenerate the vendored browser bundle:  
   `npm run vendor:secret-generator`  
   Commit `site/app/vendor/dotenvup-secret-generator.js` when it changes.
4. **Bump UnknownPassword** `site/sw.js` (`CACHE_VERSION`) when the vendored script or precache list for the generator shell changes.
5. **Update docs** in the same change set: this file (both repos), UnknownPassword `docs/LICENSING.md`, `docs/NPM_PACKAGES.md`, UI copy in `site/app/app.js` if needed.
6. **npm publish** from **DotEnvUp** only when releasing the package.

### Mirror into UnknownPassword (sibling clone)

From UnknownPassword repo root:

```bash
rsync -a --delete --exclude node_modules --exclude dist \
  ../dotenvup/packages/secret-generator/ \
  packages/secret-generator/
npm run vendor:secret-generator
```

Run tests in **both** repos.

---

## Checklist before merging

- [ ] DotEnvUp `packages/secret-generator` updated and tests pass  
- [ ] UnknownPassword mirror + vendor updated (same PR session or immediate follow-up)  
- [ ] UnknownPassword `CACHE_VERSION` bumped if vendor/precache changed  
- [ ] Both copies of `docs/SECRET_GENERATOR_SYNC.md` and Cursor `project-context.mdc` updated if process changed  
