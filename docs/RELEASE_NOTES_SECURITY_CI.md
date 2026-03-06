# Release notes: Security, CI/CD & local checks (2026-03-06)

Summary of repo-wide security, CI/CD, and documentation changes. Use this for release notes or changelog entries.

---

## CI/CD

- **GitHub Actions Security workflow** (`.github/workflows/security.yml`)
  - **Dependency audit** — `npm run security:check` (fails on high/critical) on every push/PR to `main`/`master` and weekly.
  - **OpenSSF Scorecard** — Repo security posture; results uploaded as SARIF (enable Code scanning in repo Settings to see in Security tab).
  - **CodeQL (SAST)** — Static analysis for JavaScript with `security-extended` queries on every push/PR and weekly.
  - Triggers: push/PR to main/master, weekly Monday 00:00 UTC, and `workflow_dispatch`.

- **Dependabot** (`.github/dependabot.yml`)
  - Weekly npm dependency updates (root).
  - Weekly GitHub Actions updates.
  - Labels: `dependencies` (npm), `dependencies` + `github-actions` (actions).
  - Commit prefix: `chore(deps)` / `chore(ci)`.

---

## Local & npm

- **Root `package.json` scripts**
  - `npm run audit` — Dependency audit (report only).
  - `npm run audit:fix` — Apply non-breaking fixes.
  - `npm run security:check` — Audit; **fail** on high/critical (use before push and in CI).
  - `npm run security:sast` — Run Semgrep SAST (requires `brew install semgrep` or `pip install semgrep`).

- **Dependency audit: 0 vulnerabilities**
  - Pinned `@vscode/test-cli` to `0.0.11` in the extension package (avoids vulnerable mocha/diff/serialize-javascript from 0.0.12).
  - Root **overrides** for transitive vulns: `diff@8.0.3`, `serialize-javascript@7.0.3`, `esbuild@>=0.25.0`, and nested overrides for `mocha` (diff + serialize-javascript).
  - Extension devDependency `esbuild` bumped to `^0.25.0` (CORS/dev-server fix).
  - `npm run security:check` and `npm audit` report 0 vulnerabilities after lockfile regeneration.

---

## Documentation

- **`docs/SECURITY_CHECKS_LOCAL.md`** — Reusable guide for local security checks (any Node/npm project):
  - Quick-reference table: what can be run locally, with or without extra install.
  - **Dependency audit** (npm), **SAST** (Semgrep + CodeQL), **OpenSSF Scorecard**, **Snyk**, **OWASP Dependency-Check**, **secret scanning** (Gitleaks/TruffleHog), **outdated deps** (`npm outdated`).
  - **OWASP** — How checks map to OWASP Top 10 (A06 = deps, SAST = code, secret scanning).
  - **GitHub** — SAST already in CI (CodeQL); how to enable Code scanning.
  - **GitLab** — Short note on built-in SAST template.
  - Checklist and one-liners for pre-push (with/without SAST).
  - Copy-paste for new projects (scripts + CI/Dependabot reuse).

- **`docs/SECURITY_AUDIT_REMEDIATION.md`** — npm audit remediation plan and status:
  - Per-vuln plan (diff/mocha, serialize-javascript, minimatch, rollup, esbuild, vite/vitest).
  - Root overrides and vscode-dotenvup esbuild bump documented.
  - Checklist marked done for current state (0 vulns).

- Workflow and Dependabot configs reference `docs/SECURITY_CHECKS_LOCAL.md` in comments.

---

## Tests

- **Format, CLI, Node, MCP** — All tests pass (Vitest).
- **Extension** — Extension host tests can time out or be flaky in some environments (unchanged by this work); run with `npm run test --workspace=dotenvup` when VS Code test host is available.

---

## Short copy for release notes

**Security & CI (repo-wide)**

- GitHub Actions: Security workflow with dependency audit, OpenSSF Scorecard, and CodeQL (SAST) on push/PR and weekly.
- Dependabot: weekly npm and GitHub Actions updates.
- Local scripts: `security:check` (audit, fail on high/critical), `security:sast` (Semgrep).
- Dependency audit: 0 vulnerabilities (overrides + @vscode/test-cli pin + esbuild bump).
- Docs: `docs/SECURITY_CHECKS_LOCAL.md` (reusable local security checks, OWASP mapping, secret scanning, GitHub/GitLab); `docs/SECURITY_AUDIT_REMEDIATION.md` (audit remediation plan).
