# SEO and LLM optimization audit (dotenvup.com)

Last checked: 2026-02. Use this as a checklist and fix log.

---

## SEO status

### Meta and titles
| Item | Status | Notes |
|------|--------|-------|
| `<title>` | OK | Extension-first, under 60 chars. |
| `<meta name="description">` | OK | Extension-first, ~155 chars. |
| `<meta name="keywords">` | OK | VS Code, Cursor, dotenv, encrypted env, etc. |
| `<html lang="en">` | OK | Set. |
| `<link rel="canonical">` | OK | https://dotenvup.com/ |
| Viewport | OK | Present. |

### Open Graph and Twitter
| Item | Status | Notes |
|------|--------|-------|
| og:type, og:url, og:title, og:description | OK | Extension-first. |
| og:site_name | OK | DotEnvUp. |
| og:image / twitter:image | OK | `assets/og-image.png` exists (812 KB). Optional: add og:image:width 1200, og:image:height 630 if dimensions differ. |
| twitter:card, title, description | OK | summary_large_image. |

### Structured data (JSON-LD)
| Item | Status | Notes |
|------|--------|-------|
| SoftwareApplication | OK | name, description, url, license, offers, author, codeRepository, softwareVersion. |
| TechArticle (format spec) | OK | Links to FORMAT_SPEC.md. |
| softwareVersion | Check | Must match actual release (for example 0.6.0 or the current X.Y.Z). |

### Content and structure
| Item | Status | Notes |
|------|--------|-------|
| Single H1 | OK | "Encrypted .env in VS Code & Cursor". |
| H2/H3 hierarchy | OK | Logical sections. |
| Image alt text | OK | Logo and SVGs have descriptive alt. |
| Internal links | OK | #cli, nav to Format Spec, User Guide, GitHub. |
| External links | OK | Marketplace, Open VSX, GitHub, npm. |

### Crawlability
| Item | Status | Notes |
|------|--------|-------|
| robots.txt | OK | Allow: /, Sitemap URL. |
| sitemap.xml | OK | Single URL, lastmod, changefreq weekly, priority 1.0. |
| lastmod in sitemap | OK | Update when you make meaningful content changes. |

### Gaps to fix
1. **og-image.png** — Present in `assets/og-image.png`. No action unless you want to add optional `<meta property="og:image:width">` / `og:image:height` for crawlers.
2. Keep **softwareVersion** in JSON-LD in sync with `packages/vscode-dotenvup/package.json` before each release.

---

## LLM optimization status (llms.txt)

`llms.txt` is intended for AI crawlers and LLM context. It should state clearly what the product is and how to use it.

### Current issues
- **Lead is format/tooling**, not the extension. Many users and LLMs still infer "CLI first."
- **Installation order** lists CLI first, extension as a comment.
- No explicit **one-line summary** for AI (e.g. "DotEnvUp is primarily a VS Code and Cursor extension …").

### Recommended structure for llms.txt
1. **One-line summary** (for AI): "DotEnvUp is a VS Code and Cursor extension for encrypting .env files; CLI is for terminal and CI."
2. **What is DotEnvUp** — extension-first (status bar, Safe Edit, no plaintext on disk), then format and CLI.
3. **Key features** — extension first (one-click lock/unlock, Safe Edit, Partially protected, sharing from editor), then CLI/format.
4. **Installation** — extension first (Marketplace, Open VSX, .vsix), then CLI, then Node library.
5. **Links** — unchanged.

See `llms.txt` in this repo for the updated content.

---

## Quick checklist (before each release)

- [ ] Title and meta description still extension-first and under length.
- [ ] `softwareVersion` in index.html JSON-LD matches extension version.
- [ ] sitemap.xml lastmod updated if content changed.
- [ ] llms.txt version/install commands updated if needed.
- [ ] og-image.png present in assets/ (already in repo); update if rebranding.
