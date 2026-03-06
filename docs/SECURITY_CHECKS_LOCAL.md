# Local security checks (reusable across projects)

Run these locally before pushing. Copy the scripts and ideas into any Node/npm, monorepo, or JS/TS project.

---

## Run locally – what’s possible (quick reference)

| Check | Command | Needs install? |
|-------|--------|----------------|
| **Dependency audit** | `npm run security:check` | No (npm only). |
| **Dependency audit (report)** | `npm run audit` | No. |
| **Fix deps (non‑breaking)** | `npm run audit:fix` | No. |
| **SAST (Semgrep)** | `npm run security:sast` | Yes: `brew install semgrep` or `pip install semgrep`. |
| **SAST (CodeQL)** | See [§2](#2-sast-static-application-security-testing) | Yes: [CodeQL CLI](https://codeql.github.com/docs/codeql-cli/setting-up-the-codeql-cli/). |
| **OpenSSF Scorecard** | `scorecard --local .` or `scorecard --repo=github.com/OWNER/REPO` | Yes: `brew install scorecard` or `go install ...`. |
| **Snyk (deps/code)** | `snyk test` / `snyk code test` | Yes: `npm i -g snyk` + `snyk auth`. |
| **OWASP Dependency-Check** | See [§6](#6-owasp-dependency-check) | Yes: Docker. |
| **Secret scanning** | `gitleaks detect` or `trufflehog filesystem .` | Yes: `brew install gitleaks` or `trufflehog`. |
| **Outdated deps** | `npm outdated` | No. |

**OWASP:** The checks above map to OWASP Top 10: **A06 (vulnerable components)** = `security:check` + OWASP Dependency-Check; **secure code** (injection, XSS) = SAST (Semgrep/CodeQL). Semgrep includes [OWASP rules](https://semgrep.dev/explore?severity=ERROR&tags=owasp). See [OWASP section](#owasp-how-this-fits) below.

**Minimal local run (no extra install):**

```bash
npm run security:check && npm run build && npm test
```

Equivalent convenience script in this repo:

```bash
npm run release:verify
```

**With SAST (after installing Semgrep):**

```bash
npm run security:check && npm run security:sast && npm run build && npm test
```

Equivalent convenience script in this repo:

```bash
npm run release:verify:full
```

---

## 1. Dependency audit (npm)

**What:** Known vulnerabilities in dependencies (OWASP A06 – vulnerable components).

| Command | Purpose |
|--------|---------|
| `npm audit` | Report only (exit 0 even with vulns). |
| `npm audit --audit-level=high` | **Fail** the run if high/critical (use in CI and pre-push). |
| `npm audit fix` | Apply non-breaking fixes. |
| `npm audit fix --force` | Apply all fixes (may introduce breaking changes). |

**Suggested `package.json` scripts (root):**

```json
"scripts": {
  "audit": "npm audit",
  "audit:fix": "npm audit fix",
  "security:check": "npm audit --audit-level=high"
}
```

**Run locally:**  
`npm run security:check` before merging. Use `npm run audit:fix` then re-run to reduce vulns.

**Other package managers:**

- **yarn:** `yarn audit` / `yarn audit --severity high` (check yarn docs for fail-on-severity).
- **pnpm:** `pnpm audit` / `pnpm audit --audit-level high`; use `pnpm audit --fix` for fixes.

---

## 2. SAST (static application security testing)

**What:** Finds bugs and security issues in source code (injection, XSS, hardcoded secrets, bad crypto). Yes, you can run it **locally before push** and it **can (and should) be part of CI/CD**.

### Run SAST locally (before push)

**Option A – Semgrep (fast, recommended for pre-push):**

```bash
# Install once: brew install semgrep  OR  pip install semgrep
semgrep scan --config auto
# Security-only (stricter): semgrep scan --config p/security-audit
```

**Option B – CodeQL (deeper, slower; good for CI):**

```bash
# Install: https://codeql.github.com/docs/codeql-cli/setting-up-the-codeql-cli/
codeql database create ./codeql-db --language=javascript --source-root=.
codeql database analyze ./codeql-db javascript-security-extended --format=sarif-latest --output=codeql-results.sarif
```

**Suggested `package.json` script (optional):**

```json
"security:sast": "semgrep scan --config auto --error"
```

Then run `npm run security:sast` before push. Use `--error` so findings fail the command (CI-friendly).

### SAST in CI/CD (GitHub)

On **GitHub** it’s already set up in this repo: [`.github/workflows/security.yml`](../.github/workflows/security.yml) has a **CodeQL (SAST)** job that runs on every push/PR and weekly. Enable **Code scanning** in the repo: **Settings → Code security and analysis** → turn on **Code scanning**. Results (CodeQL + Scorecard) then show under the **Security** tab.

---

## 3. OpenSSF Scorecard (repo posture)

**What:** Checks repo security posture (branch protection, CI, dependencies, etc.). No secrets needed for public repos.

**Install (one-time):**

```bash
# macOS (Homebrew)
brew install scorecard

# Or via Go
go install github.com/ossf/scorecard/v5@latest
```

**Run locally (from repo root):**

```bash
scorecard --repo=github.com/OWNER/REPO --format=default
# Or for local repo (no GitHub slug needed for some checks):
scorecard --local . --format=default
```

**Use:** Fix low-score areas (e.g. enable branch protection, Dependabot, CodeQL in CI). Improves “Supply chain security” and trust.

---

## 4. Snyk (deps + code) – optional

**What:** Dependency and optional code vulns; needs free Snyk account and `snyk auth`.

**Install:** `npm i -g snyk` or `brew install snyk`.

**Run locally:**

```bash
snyk test
snyk test --severity-threshold=high   # fail on high+
# Optional code scan:
snyk code test
```

**Use:** Good for a second opinion on deps; can run in CI with `SNYK_TOKEN`.

---

## 5. Secret scanning (no secrets in repo)

**What:** Detects committed secrets (API keys, passwords, tokens). Run before push so nothing leaks.

| Tool | Install | Command |
|------|--------|--------|
| **Gitleaks** | `brew install gitleaks` | `gitleaks detect --source . --no-git` (or omit `--no-git` to use git history). |
| **TruffleHog** | `brew install trufflehog` | `trufflehog filesystem .` |

**Example (Gitleaks, fail on finding):**

```bash
gitleaks detect --redact
```

**Use:** Add to pre-push or CI; fix any finding before merging.

---

## 6. OWASP Dependency-Check (deps)

**What:** OWASP’s own dependency/vuln scanner. Second opinion to npm audit; uses NVD and other feeds.

**Run locally (Docker):**

```bash
docker run --rm -v "$(pwd)":/src owasp/dependency-check:latest --scan /src --project "myapp" -f JSON -o /src/depcheck-report.json
```

**Use:** Review report; add to CI if you want both npm audit and OWASP check.

---

## 7. Other quick checks (no install)

- **Outdated packages:** `npm outdated` – see what’s behind; upgrade with care.
- **Lockfile vs package.json:** `npm ci` (in CI) ensures install matches lockfile; run `npm ci` locally sometimes to catch drift.

---

## OWASP – how this fits

| OWASP Top 10 (examples) | What we run |
|------------------------|-------------|
| **A06:2021 – Vulnerable and outdated components** | `npm run security:check`, `npm run audit:fix`, OWASP Dependency-Check (§6). |
| **A03:2021 – Injection, A07:2021 – XSS** (and other code bugs) | SAST: Semgrep (`security:sast`), CodeQL. Semgrep: use `p/owasp-top-ten` or `p/security-audit`. |
| **Secrets in repo** | Secret scanning: Gitleaks, TruffleHog (§5). |

So: **yes, OWASP is part of it.** Dependency audit + OWASP Dependency-Check cover A06; SAST (with OWASP rules in Semgrep) covers code issues; secret scanning avoids leaking credentials.

---

## Checklist (run before merge)

- [ ] `npm run security:check` – 0 high/critical.
- [ ] `npm run security:sast` (if Semgrep installed) – no findings.
- [ ] (Optional) `gitleaks detect` or `trufflehog filesystem .` – no secrets in repo.
- [ ] `npm run build` and `npm test` – green.
- [ ] (Optional) `scorecard --local .`, OWASP Dependency-Check – review and fix.

---

## CI/CD and Dependabot (reuse in other projects)

**In this repo (GitHub):**

- **Security workflow:** [`.github/workflows/security.yml`](../.github/workflows/security.yml) – runs **audit** (`security:check`), **OpenSSF Scorecard**, and **CodeQL (SAST)** on push/PR and weekly.
- **Dependabot:** [`.github/dependabot.yml`](../.github/dependabot.yml) – weekly npm + GitHub Actions updates.

**To reuse in another GitHub project:**

1. Copy `.github/workflows/security.yml`. If not Node: replace the `audit` job with that stack’s check (e.g. `pip audit`, `cargo audit`).
2. Copy `.github/dependabot.yml`. Adjust `package-ecosystem` if needed (e.g. add `docker`, `terraform`).
3. In GitHub: **Settings → Code security and analysis** → enable **Dependency graph** and **Code scanning** so Scorecard and SAST (CodeQL) show under Security.

### GitLab (if you use it)

GitLab has built-in SAST: add `include: - template: Jobs/SAST.gitlab-ci.yml` to `.gitlab-ci.yml`. For local SAST before push, use Semgrep or CodeQL CLI as in [§2 SAST](#2-sast-static-application-security-testing).

---

## Minimal copy-paste (new project)

**Root `package.json` scripts:**

```json
"audit": "npm audit",
"audit:fix": "npm audit fix",
"security:check": "npm audit --audit-level=high"
```

**One-liner local check (deps + build + test):**

```bash
npm run security:check && npm run build && npm test
```

**With SAST (if Semgrep is installed and you added `security:sast`):**

```bash
npm run security:check && npm run security:sast && npm run build && npm test
```

Use the same pattern with your package manager (yarn/pnpm). On GitLab, add the SAST template to `.gitlab-ci.yml` so SAST runs in CI; locally you can still use Semgrep or CodeQL.
