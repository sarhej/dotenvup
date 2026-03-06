# npm audit remediation plan

Plan for addressing the 11 vulnerabilities reported by `npm audit`. Order is by priority (high first, then moderate/low) and dependency chain.

---

## 1. diff / jsdiff → mocha → @vscode/test-cli (DoS)

| Package | Issue | Severity | Where |
|--------|--------|----------|--------|
| diff (jsdiff) | DoS in parsePatch/applyPatch | — | transitive via mocha → @vscode/test-cli |
| mocha | Depends on vulnerable diff + serialize-javascript | — | transitive via @vscode/test-cli |
| @vscode/test-cli | Depends on vulnerable mocha | — | `packages/vscode-dotenvup` |

**Fix:** Pin `@vscode/test-cli` to `0.0.11` in `packages/vscode-dotenvup/package.json` (0.0.12 pulls in vulnerable mocha/diff).  
**Status:** [x] Done. Pinned @vscode/test-cli to 0.0.11. Remaining diff/serialize-javascript (via mocha) fixed via root `overrides` (see below).

---

## 2. serialize-javascript (RCE)

| Package | Issue | Severity | Where |
|--------|--------|----------|--------|
| serialize-javascript | RCE via RegExp.flags / Date.prototype.toISOString | high | transitive via mocha → @vscode/test-cli |

**Fix:** Addressed via root `overrides` (serialize-javascript@7.0.3, and mocha → serialize-javascript).  
**Status:** [x] Done (overrides)

---

## 3. minimatch (ReDoS)

| Package | Issue | Severity | Where |
|--------|--------|----------|--------|
| minimatch | ReDoS (multiple advisories) | high | root or transitive |

**Fix:** Root `overrides` (diff@8.0.3, and mocha → diff).  
**Status:** [x] Done (overrides)

---

## 4. rollup (path traversal)

| Package | Issue | Severity | Where |
|--------|--------|----------|--------|
| rollup | Arbitrary file write via path traversal (4.x) | high | transitive (likely vite/vitest) |

**Fix:** `npm audit fix`. If that bumps rollup to 4.x patch or 5.x, run full build + tests.  
**Status:** [ ] Run `npm audit fix`; re-test

---

## 5. esbuild (dev server)

| Package | Issue | Severity | Where |
|--------|--------|----------|--------|
| esbuild | Any website can send requests to dev server and read response | moderate | vscode-dotenvup (esbuild ^0.24.0), vite/vitest |

**Fix:** Bump esbuild to ^0.25.0 in vscode-dotenvup + root `overrides` "esbuild": ">=0.25.0".  
**Status:** [x] Done

---

## 6. vite / @vitest/mocker / vitest / vite-node (esbuild chain)

| Package | Issue | Severity | Where |
|--------|--------|----------|--------|
| vite, @vitest/mocker, vitest, vite-node | Depend on vulnerable esbuild | moderate | root vitest, workspace tests |

**Fix:** Resolved by root override esbuild >= 0.25.0 (vitest/vite get the overridden esbuild).  
**Status:** [x] Done

---

## Summary checklist

- [x] **1** Pin @vscode/test-cli to 0.0.11 (vscode-dotenvup).
- [ ] **2** Verify serialize-javascript gone after #1.
- [x] **3** Run `npm audit fix` (minimatch, rollup) — done; 8 vulns remaining.
- [x] **4** Same as #3.
- [x] **5** Bump esbuild in vscode-dotenvup to ^0.25.0 + root override.
- [x] **6** Override esbuild applied to vitest/vite.
- [x] Run `npm run security:check` — 0 vulnerabilities.
- [x] Run full test suite (`npm test`) and extension tests — all pass.

### Root overrides (package.json)

To get to 0 vulnerabilities, the following overrides were added (lockfile was regenerated so they take effect):

```json
"overrides": {
  "diff": "8.0.3",
  "serialize-javascript": "7.0.3",
  "esbuild": ">=0.25.0",
  "mocha": {
    "diff": "8.0.3",
    "serialize-javascript": "7.0.3"
  }
}
```

vscode-dotenvup devDependency: `esbuild` set to `^0.25.0`.

---

*Last updated from `npm audit` output (diff, esbuild, minimatch, rollup, serialize-javascript).*
