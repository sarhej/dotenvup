# npm audit remediation plan

Current goal: **`npm run security:check` → 0 vulnerabilities** on both the monorepo root lockfile and `workers/dotenvup-edge` (separate Wrangler lockfile).

Order is by priority (high first) and dependency chain. Historical items kept for context.

---

## Current status (2026-09-29)

| Check | Result |
|--------|--------|
| `npm audit` / `npm run security:check` | **0 vulnerabilities** |
| Root cause of CI red | Stale transitive versions (vitest, hono, js-yaml, fast-uri, qs, ip-address) |
| Fix applied | `npm audit fix` + sync root `overrides` to patched floors + lockfile regen |

### Root overrides (`package.json`)

Keep overrides at **patched floors** so a later `npm install` cannot re-pin vulnerable versions:

```json
"overrides": {
  "diff": "8.0.3",
  "serialize-javascript": "7.0.5",
  "brace-expansion": "5.0.9",
  "fast-uri": ">=3.1.8",
  "js-yaml": ">=4.3.2",
  "nanoid": "3.3.18",
  "hono": ">=4.13.11",
  "qs": ">=6.16.0",
  "ip-address": ">=10.5.1",
  "mocha": {
    "diff": "8.0.3",
    "serialize-javascript": "7.0.5"
  }
}
```

**Rule:** Any security lockfile bump that touches overridden packages must update `overrides` in the same PR.

---

## 1. diff / jsdiff → mocha → @vscode/test-cli (DoS)

| Package | Issue | Severity | Where |
|--------|--------|----------|--------|
| diff (jsdiff) | DoS in parsePatch/applyPatch | — | transitive via mocha → @vscode/test-cli |
| mocha | Depends on vulnerable diff + serialize-javascript | — | transitive via @vscode/test-cli |
| @vscode/test-cli | Depends on vulnerable mocha | — | `packages/vscode-dotenvup` |

**Fix:** Root `overrides` for `diff` / `serialize-javascript` (and under `mocha`).  
**Status:** [x] Done

---

## 2. serialize-javascript (RCE)

| Package | Issue | Severity | Where |
|--------|--------|----------|--------|
| serialize-javascript | RCE via RegExp.flags / Date.prototype.toISOString | high | transitive via mocha → @vscode/test-cli |

**Fix:** Override `serialize-javascript@7.0.5`.  
**Status:** [x] Done

---

## 3. minimatch / brace-expansion (ReDoS)

**Fix:** Root override `brace-expansion` / historical minimatch remediation.  
**Status:** [x] Done

---

## 4. rollup / vite toolchain (path traversal)

Earlier rollup advisories. Current tree uses Vite 8 / rolldown; keep vitest current (`^4.1.11`).  
**Status:** [x] Addressed via vitest/vite lockfile bumps (2026-09-29)

---

## 5. esbuild (dev server)

**Fix:** Bump esbuild to ^0.25.0 in vscode-dotenvup (historical).  
**Status:** [x] Done

---

## 6. hono / fast-uri / js-yaml / qs / ip-address (MCP + test CLI tree)

| Package | Severity | Via | Floor |
|--------|----------|-----|-------|
| hono | high/moderate | `@modelcontextprotocol/sdk` | `>=4.13.11` |
| fast-uri | high | ajv | `>=3.1.8` |
| js-yaml | high | mocha → `@vscode/test-cli` | `>=4.3.2` |
| qs | moderate | express | `>=6.16.0` |
| ip-address | moderate | express-rate-limit | `>=10.5.1` |

**Note:** DotEnvUp MCP uses **stdio** only (not Hono HTTP). Still keep hono patched for transitive hygiene and consumers who enable HTTP transports.  
**Status:** [x] Done (2026-09-29)

---

## Summary checklist

- [x] Pin / override mocha toolchain (diff, serialize-javascript)
- [x] esbuild ≥ 0.25 where used
- [x] Sync overrides with lockfile after every `npm audit fix`
- [x] `npm run security:check` — 0 vulnerabilities
- [x] `npm run build` + `npm test`

### When CI Security → Dependency audit fails again

1. `npm run security:check` locally
2. `npm audit fix` (avoid `--force` unless intentional)
3. Update `overrides` floors for any package still pinned below the patched version
4. `npm install` → re-run `security:check` + build + test
5. Open a PR; do **not** admin-merge past a red Dependency audit on an open-source default branch

---

*Last updated 2026-09-29 from `npm audit` (vitest/hono/js-yaml/fast-uri/qs/ip-address).*
