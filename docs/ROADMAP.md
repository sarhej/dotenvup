# DotEnvUp Roadmap

> Last updated: 2026-08-01

## Status Summary

| Component | Status |
|-----------|--------|
| `@dotenvup/format` | Production-ready |
| `@dotenvup/cli` | Production-ready (except Windows CI — needs Win machine) |
| VS Code Extension | MVP / Scaffold — **needs production hardening** |
| Native Installers | Not started — **nearest backlog** |

---

## Priority 1: VS Code Extension — Production Ready

The extension works end-to-end but is MVP quality. Every item below must be addressed before publishing to the VS Code Marketplace.

### 1.1 Error Handling & Safety

- [ ] **Lock command: drift detection** — Before deleting `.env`, compare contents with what `.env.up` would decrypt to. Warn if `.env` has changes not in `.env.up` (matches CLI behavior).
- [ ] **Lock command: confirmation dialog** — Show "About to delete .env (N keys). Proceed?" before deleting, with a "Don't ask again" option stored in workspace settings.
- [ ] **Lock command: verify `.env.up` is decryptable** — Before deleting `.env`, attempt decrypt. If it fails (wrong key, corrupt file), refuse to delete and tell user why. Mirrors CLI's `--force-delete` safeguard but via a dialog.
- [ ] **Unlock command: overwrite protection** — If `.env` already exists when unlocking, warn that it will be overwritten. Show diff summary if possible.
- [ ] **Unlock command: atomic write** — Write to `.env.tmp` first, then rename to `.env`. Prevents partial writes on crash.
- [ ] **Import command: validate `.env` parsing** — Handle edge cases: BOM, CRLF, empty values, export prefix, multiline values in quotes. Reuse the CLI's battle-tested `dotenv` parser or share the parsing logic.
- [ ] **Import command: refuse symlinks** — Check that source `.env` is a regular file, not a symlink.
- [ ] **Deactivate handler: graceful lock** — Current `deactivate()` fires `dotenvup.lock` but can't await async ops reliably. Use `fs.unlinkSync` as a fallback to ensure `.env` is cleaned up on extension shutdown.
- [ ] **File watcher: handle renames and moves** — The current watcher only watches create/delete of `.env.up`. Handle renames (e.g., `.env.up` → `.env.up.bak`) and re-scan on workspace folder changes.

### 1.2 Status Bar Enhancements

- [ ] **Real-time lock state** — Watch both `.env` and `.env.up` for changes (create, delete, modify). Update status bar automatically instead of only after command execution.
- [ ] **Timer countdown** — When unlocked with a duration, show remaining time in status bar tooltip (e.g., "Auto-locks in 3m 42s"). Update every ~30s.
- [ ] **Color/icon states** — Use `statusBarItem.backgroundColor` for warning states: red if `.env` exists with no `.env.up` (unprotected), yellow if stale keys detected.
- [ ] **Multi-root workspace** — Support multiple workspace folders. Show per-folder status or aggregate. Currently only uses `workspaceFolders[0]`.

### 1.3 Shared Logic with CLI

- [ ] **Extract shared `.env` parser** — Both CLI and extension have their own `parseEnv()`. Move to `@dotenvup/format` or a shared utility so bug fixes apply to both.
- [x] **Local identity envelope (M1)** — File-wrapped `identity.enc` + recovery codes; opt-in `up key upgrade`. See [RELEASE_NOTES_IDENTITY_ENVELOPE.md](./RELEASE_NOTES_IDENTITY_ENVELOPE.md). Touch ID / Keychain helper is separate (M2+; [KEYCHAIN_TOUCHID.md](./design/KEYCHAIN_TOUCHID.md)).
- [ ] **Settings for defaults** — Add VS Code settings for: default unlock duration, auto-lock on window close (on/off), stale key threshold (days), show confirmation dialogs (on/off).

### 1.4 Testing

- [ ] **Unit tests for each command** — Current tests only check activation and command registration. Add tests for: init (new + overwrite), import (valid/invalid/edge cases), lock (with/without .env, drift), unlock (duration, auto-lock), status (all states), showKeys (formatting).
- [ ] **Mock filesystem tests** — Use `memfs` or temp directories to test file operations without touching real disk.
- [ ] **Integration tests** — Test full workflows: init → import → lock → unlock → lock cycle.
- [ ] **Error path tests** — No workspace open, corrupt `.env.up`, missing keypair, permission denied, symlink inputs.

### 1.5 UX Polish

- [ ] **Welcome experience** — On first activation (no `.env.up` found), show a walkthrough or notification: "Get started: run DotEnvUp: Init, then Import your .env."
- [ ] **Context menu** — Add "Import to .env.up" to the file explorer context menu for `.env` files.
- [ ] **Editor decorations** — When `.env.up` is open, show read-only decorations for encrypted sections and highlight metadata fields.
- [ ] **Marketplace metadata** — Add `icon`, `galleryBanner`, `badges`, `categories` (change from "Other" to "Security", "Other"), and proper `README.md` for the extension listing.
- [ ] **CHANGELOG.md** — Required for marketplace. Create initial changelog.

### 1.6 Build & Publish Pipeline

- [ ] **Bundle with esbuild** — Current build is raw `tsc`. Switch to esbuild for a single-file `extension.js` bundle (faster activation, smaller `.vsix`).
- [ ] **CI for extension** — GitHub Actions: lint, build, test on each push. Package `.vsix` on release tag.
- [ ] **Publish to Marketplace** — Set up publisher account, `vsce publish` in CI. **Guide:** [docs/PUBLISHING.md](./PUBLISHING.md). From root: `npm run publish:extension` (after `vsce login dotenvup`).
- [ ] **Pre-release channel** — Use VS Code pre-release versioning for early feedback.

---

## Priority 2 (Nearest Backlog): Native Installers & OS File Type Registration

> **Prerequisite:** Extension must be production-ready first. These items enable `up` CLI as a standalone binary without Node.js, and register `.env.up` as a recognized file type at the OS level.

### 2.1 Single Executable Binary (Foundation)

All native installers depend on this step.

- [ ] **esbuild CLI bundle** — Bundle all CLI source into a single `dist/cli.cjs` file (tree-shaken, no external deps except native modules like `keytar`).
- [ ] **Node.js SEA (Single Executable Application)** — Use Node.js built-in SEA to create standalone `up` binaries for each platform:
  - `up-darwin-arm64` (macOS Apple Silicon)
  - `up-darwin-x64` (macOS Intel)
  - `up-linux-x64`
  - `up-linux-arm64`
  - `up-win-x64.exe`
- [ ] **Test binaries** — Verify each binary works without Node.js installed (run in clean Docker/VM).
- [ ] **Handle native modules** — `keytar` uses native bindings. Either bundle pre-built binaries or switch to a pure-JS keychain alternative for SEA compatibility.

### 2.2 GitHub Actions Release Pipeline

- [ ] **Build matrix** — On release tag, build SEA binaries for all 5 targets using GitHub Actions matrix (macOS, Ubuntu, Windows runners).
- [ ] **Sign macOS binary** — Apple notarization with `codesign` + `xcrun notarytool`. Requires Apple Developer account ($99/year) and signing certificate in GitHub Secrets.
- [ ] **Sign Windows binary** — Code signing certificate for SmartScreen trust. Options: paid cert (~$200-400/year) or free via SignPath for OSS.
- [ ] **Upload to GitHub Release** — Attach all binaries, checksums (`sha256`), and installer packages to the release.
- [ ] **Automate changelog** — Generate release notes from conventional commits or PR titles.

### 2.3 Homebrew Tap (macOS + Linux)

- [ ] **Create `homebrew-dotenvup` repo** — GitHub repo `sarhej/homebrew-dotenvup` with a formula.
- [ ] **Formula** — Download SEA binary from GitHub Release, verify checksum, symlink to `up`.
- [ ] **Test** — `brew install sarhej/dotenvup/dotenvup && up --version`.
- [ ] **Auto-update formula** — GitHub Action on release bumps version + SHA in the formula.
- [ ] **Cask (optional)** — If we ship a `.pkg` later, create a Cask for `brew install --cask dotenvup`.

### 2.4 OS-Level File Type Registration

These items activate once native installers exist. Canonical identifiers are already documented in [`docs/FILE_TYPE.md`](./FILE_TYPE.md).

#### macOS

- [ ] **`.pkg` installer** — Built with `pkgbuild`/`productbuild`. Installs binary to `/usr/local/bin/up`, registers UTI `com.unknownpassword.env-up` via postinstall script, optionally installs custom Finder icon.
- [ ] **Notarize `.pkg`** — Required for Gatekeeper. Sign + notarize in CI.

#### Linux

- [ ] **`.deb` package** — For Debian/Ubuntu. Includes binary, `shared-mime-info` XML (`application/vnd.dotenvup.encrypted`), and custom icon.
- [ ] **`.rpm` package** — For Fedora/RHEL. Same contents, different packaging.
- [ ] **Post-install script** — Runs `update-mime-database` after installing MIME XML.

#### Windows

- [ ] **Inno Setup installer** — Creates `.exe` installer. Writes registry keys for `.env.up` file association, friendly type name "DotEnvUp Encrypted Env", custom icon, default "Open with" to VS Code. Adds `up.exe` to PATH.
- [ ] **Winget manifest** — For `winget install dotenvup`.
- [ ] **Scoop manifest** — For `scoop install dotenvup` (portable, no admin).
- [ ] **Chocolatey package** — For `choco install dotenvup`.

### 2.5 Auto-Update (Optional, Post-Launch)

- [ ] **Update check** — `up` binary checks GitHub Releases API on first run per day. Notifies if newer version available.
- [ ] **Self-update command** — `up update` downloads and replaces the binary in-place.
- [ ] **Homebrew users** — Skip self-update, defer to `brew upgrade`.

---

## Priority 3 (Backlog): Newbie onboarding & secret intake

Ideas for first-time users who do not yet have a clean `.env` workflow. **Constraint:** no remote LLMs for parsing or OCR — clipboard / image intake must stay on-device (local Vision / Tesseract / regex heuristics only). Cloud sync of secrets remains out of scope for OSS DotEnvUp (see UnknownPassword for team sharing).

### 3.1 “Where do I get this secret?”

- [ ] **Per-key origin notes** — Store optional cleartext metadata on each key (or beside `.env.example`): where to create it (URL), account required, and short steps. Shown in Key Management / `up keys` without decrypting values.
- [ ] **“Open provider” actions** — From a missing/empty key, open the docs or console URL (e.g. OpenAI API keys page) in the browser.
- [ ] **Export setup checklist to Notes** — Generate a plain-text / Markdown checklist (“Create OPENAI_API_KEY at …, paste into DotEnvUp”) the user can copy into Apple Notes, Notion, etc. Instructions only — never the secret value.
- [ ] **Template packs for common stacks** — One-click `.env.example` scaffolds (Next.js, Vite, Supabase, Stripe, etc.) with origin notes prefilled; user fills values locally.

### 3.2 Paste (and optional screenshot) → `.env` entry

- [ ] **Paste secret → guided import** — User pastes `sk-…` or `KEY=value`; extension/CLI proposes a key name (editable), appends/updates `.env`, then offers `import` + lock. No network.
- [ ] **Multi-line paste** — Accept a pasted block of several `KEY=value` lines (or common export formats) and merge with conflict prompts.
- [ ] **Local screenshot / image OCR (optional)** — User drops a PNG/JPEG of a provider “API key created” screen; **on-device only** OCR extracts candidate secrets; user confirms before write. Explicitly **no** remote vision/LLM APIs. Behind a setting; fail closed if OCR unavailable.
- [ ] **Clipboard hygiene** — After successful import, optional prompt to clear clipboard if it still holds the pasted secret.

### 3.3 Any secrets file, not only `.env`

- [ ] **Configurable env file name(s)** — Support `.env.local`, `.env.production`, `.env.development`, and custom paths; map each to a corresponding `.env.up` (or a single multi-file envelope — design TBD).
- [ ] **`up import <file>` / extension “Import this file”** — Already partially true for path args; harden UX so non-`.env` basenames are first-class (status bar, lock/unlock target, drift).
- [ ] **Non-dotenv formats (later)** — Optional import from simple `KEY: value` YAML/JSON maps into `.env.up` metadata+values (still encrypted values). Keep export as dotenv for zero app changes.
- [ ] **Multi-file project status** — Status / Key Management lists all managed secret files and lock state per file.

### 3.4 More newbie-friendly UX

- [ ] **First-run wizard** — Expand welcome walkthrough: Init → pick template or existing file → paste/fill keys → import → lock → “run with `up run --`”. Link to Cursor plugin / skill install.
- [ ] **Empty-state copy that teaches** — When unlocked with empty values, show “This key is empty — here’s where to get it” instead of only a blank input.
- [ ] **Safe demo mode** — Sample `.env.example` + fake values so users can practice lock/unlock/import without real credentials.
- [ ] **Recovery codes → printable / Notes export** — One-click “Save recovery instructions” after `up key upgrade` / init (codes shown once; file is user-managed).
- [ ] **Glossary tooltips** — In-extension explanations of lock, drift, identity, `.env.up` vs `.env` for non-security people.
- [ ] **CLI coach mode** — `up doctor` / `up guide`: checks identity, `.env.up`, gitignore, and prints next best command for newbies.

---

## Effort Estimates

| Work Item | Effort | Dependencies |
|-----------|--------|--------------|
| **Extension production-ready (all of Priority 1)** | **5-8 days** | None |
| esbuild CLI bundle + Node.js SEA binaries | 1-2 days | None |
| GitHub Actions release pipeline | 1-2 days | SEA binaries |
| Homebrew tap | 0.5 day | Release pipeline |
| macOS `.pkg` + notarization | 1-2 days | SEA binaries |
| Linux `.deb` + `.rpm` + MIME registration | 1 day | SEA binaries |
| Windows Inno Setup + registry + signing | 2 days | SEA binaries |
| Package manager manifests (winget/scoop/choco) | 1 day | Windows installer |
| Auto-update mechanism | 1-2 days | All installers |

**Recommended order:**
1. Extension production-ready (Priority 1)
2. SEA binaries + release pipeline + Homebrew (highest ROI)
3. Platform installers + file type registration (as needed)

---

## Priority 4 (Exploration): Format v2

v1 is stable. Exploration doc for tamper-evident metadata, signing, key `kind`/`env`, and git provenance (complements commit signing — does not replace it):

- **Design (draft):** [design/FORMAT_V2.md](./design/FORMAT_V2.md)
- **Not started:** normative spec, `@dotenvup/format` implementation, `up verify`, signing subkey

When v2 ships, target `@dotenvup/format` + CLI/extension minor releases — not a separate npm product.

**Sharing (v1):** whole-file multi-recipient only — [design/SHARING_MODEL.md](./design/SHARING_MODEL.md).

---

## References

- [File Type Registration](./FILE_TYPE.md) — Canonical MIME types, UTI, registry keys
- [User Guide](./USER_GUIDE.md) — CLI commands and workflows
- [Security Model](./SECURITY.md) — Encryption and threat model
- [AGENTS.md](../AGENTS.md) — AI agent integration guide
- For seamless team sharing: **[unknownpassword.com](https://unknownpassword.com)**
