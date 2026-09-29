# Security findings triage (open-source posture)

Living notes for GitHub Security / CodeQL / Scorecard findings that are **accepted**, **fixed**, or **tracked**. Dependency audit status: [SECURITY_AUDIT_REMEDIATION.md](SECURITY_AUDIT_REMEDIATION.md).

## Enabled on the public repo (2026-09-29)

| Control | Status |
|---------|--------|
| Dependabot alerts + security updates | Enabled |
| Secret scanning + push protection | Enabled |
| CodeQL (`security-extended`) | On every Security workflow run |
| OpenSSF Scorecard | Weekly + PR |
| `npm run security:check` | Fail on high/critical; target **0** vulns |

## Secret scanning

| Alert | Path | Resolution |
|-------|------|------------|
| Stripe-shaped placeholders | `.env.example` | Replaced with non-provider-shaped `example_*_not_real` values (2026-09-29). Close alerts as false positive / fixed. |

Rule for examples: never use `sk_test_*`, `whsec_*`, or other live-looking provider prefixes in committed samples.

## CodeQL (open alerts — triage)

### `js/insecure-temporary-file` (mostly tests + atomic write)

| Area | Assessment |
|------|------------|
| `packages/format/src/atomicWrite.ts` | **Fixed** — exclusive create (`wx` / O_EXCL) + random suffix next to target file |
| `**/__tests__/**`, `**/test/**` | **Accepted** — local test fixtures under controlled dirs; not a shipped attack surface |
| CLI / extension using `writeEnvUpAtomic` | Inherits production fix |

### `js/file-system-race` (CLI command modules)

TOCTOU between `exists` / `stat` and read on **user-local** paths (`.env`, `.env.up`). Threat model is a local multi-user shared-directory attack. DotEnvUp assumes a single trusted user on the machine for CLI unlock/import (see [SECURITY.md](SECURITY.md)).

**Accepted for now** — document here; revisit if we add multi-user shared-dir modes.

### Scorecard / supply-chain (medium)

| Finding | Assessment | Follow-up |
|---------|------------|-----------|
| Pinned-Dependencies (Actions `@v4`) | Medium — tags float | Prefer pinning Actions to full SHAs in a dedicated chore PR |
| Token-Permissions | Partially addressed — CI/Security workflows set default `permissions: contents: read`; jobs that upload SARIF keep write scopes |
| Branch-Protection / Code-Review | Repo ruleset on `main` | Keep required checks including Dependency audit |

## Do not admin-merge past a red Dependency audit

Open-source default: green `npm run security:check` before merge. Admin bypass only for infra incidents, with a same-day fix PR.
