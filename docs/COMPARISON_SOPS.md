# DotEnvUp vs SOPS

A concise comparison of **DotEnvUp** (this project) and **[SOPS](https://github.com/getsops/sops)** (Mozilla’s Secrets OPerationS). Both encrypt secrets for safe storage and version control; they differ in format, workflow, and primary use case.

---

## One-line positioning

| | DotEnvUp | SOPS |
|---|----------|------|
| **Tagline** | “.env files, but with memory — and a lock.” | Editor for encrypted files — manage secrets in YAML, JSON, ENV, etc. |
| **Core idea** | Dedicated **.env.up** file; unlock → plaintext **.env** appears; lock removes it. App code unchanged; zero cloud. | Encrypt **any** file (YAML, JSON, .env, binary); **sops edit** decrypts to editor, re-encrypts on save. Multi-backend (age, PGP, KMS). |

---

## Format and files

| Aspect | DotEnvUp | SOPS |
|--------|----------|------|
| **Target format** | **.env** only — one encrypted format (**.env.up**) with cleartext metadata header + encrypted values. | **Multiple**: YAML, JSON, ENV, INI, binary. Same filename with encrypted content (e.g. `secrets.yaml`, `config.env`). |
| **Main file** | **.env.up** — new format: key names, versions, timestamps in cleartext; values in encrypted blocks per recipient. | Original file is encrypted in place (or a copy). Structure preserved; values (and optionally keys) become encrypted blobs. |
| **Key storage** | **~/.dotenvup/identity** (one keypair per machine; shared across projects). Optional per-repo. | **age**: key file (e.g. `~/.config/sops/age/keys.txt`). **PGP**: keyring. **KMS**: AWS/GCP/Azure/Vault — keys in cloud. |
| **Safe to commit?** | Yes. **.env.up** is safe to commit; only metadata is visible. | Yes. Encrypted files are safe to commit; decryption keys stay out of repo. |
| **Plaintext on disk** | **.env** exists only when “unlocked”; lock deletes it. Optional **up run** for no file (inject only). | **sops edit** decrypts to a temp file for the editor; re-encrypts on save. No long-lived plaintext file by default. **sops -d** writes to stdout. |

---

## Security model

| Aspect | DotEnvUp | SOPS |
|--------|----------|------|
| **Crypto** | X25519-XChaCha20-Poly1305 (per-recipient). | **age**: ChaCha20-Poly1305. **PGP**: traditional PGP. **KMS**: provider’s crypto. |
| **Key model** | Local keypair only (zero-knowledge). Multi-recipient in one .env.up. | age (local), PGP (local/keyring), or **cloud KMS** (AWS, GCP, Azure, Vault). Multi-key encryption supported. |
| **What’s visible in repo** | Key names, versions, timestamps, authors — no values. | Depends on config: full structure with encrypted values, or encrypted keys too. |
| **Server / cloud** | None. No server, no account, no KMS. | Optional: SOPS can use AWS KMS, GCP KMS, Azure Key Vault, HashiCorp Vault. |

---

## Developer workflow

| Aspect | DotEnvUp | SOPS |
|--------|----------|------|
| **Encrypt** | Extension: “Protect .env” / Import. CLI: `up import .env` → .env.up, then `up lock` (removes .env). | Create or edit file, then **sops -e** to encrypt, or **sops secrets.yaml** (create encrypted from template). |
| **Decrypt / edit** | **Unlock** → .env on disk for a duration (or **up run** for no file). Edit .env, then **Import** + **Lock**. | **sops secrets.yaml** or **sops -e -d secrets.yaml** → decrypt; **sops -i secrets.yaml** edits in place (opens $EDITOR, re-encrypts on save). |
| **App code** | Unchanged. App and `dotenv` read **.env** when present. | For .env: **sops -d config.env** to stdout, or export to env; app reads env. For YAML/JSON: app typically gets decrypted file from CI or **sops -d**. |
| **Production / CI** | **up run -- your-app** (inject env, no .env file). Or unlock in controlled env with key in env. | **sops -d** in CI; key from env (e.g. **SOPS_AGE_KEY**) or KMS. Pipe decrypted output to app or write to temp. |
| **Use case focus** | **.env** and env vars: one format, one workflow, editor lock/unlock. | **Any secret file**: K8s manifests, Terraform, config files, .env. GitOps and infra-heavy. |

---

## VS Code / editor

| Aspect | DotEnvUp | SOPS |
|--------|----------|------|
| **Extension** | **DotEnvUp** (VS Code Marketplace, Open VSX). Status bar lock/unlock, import, key management, recovery. | No official SOPS extension; community extensions exist for decrypt-on-open or sops edit. |
| **Primary UX** | One-click lock/unlock; .env appears and disappears; optional timer. | Usually CLI: **sops path/to/file** to edit; or decrypt in terminal and open. |
| **Key storage** | ~/.dotenvup/identity (shared with CLI). | age key file, PGP keyring, or KMS (no local key). |

---

## CLI and ecosystem

| Aspect | DotEnvUp | SOPS |
|--------|----------|------|
| **CLI name** | `up` (`@dotenvup/cli`). | `sops`. |
| **Install** | `npm install -g @dotenvup/cli`. | brew, apt, go install, or download from [GitHub](https://github.com/getsops/sops). |
| **Run without file on disk** | **up run -- node index.js** (decrypt, inject env, no .env). | **sops -d file.env \| xargs -0 -I {} export {}** or similar; or app reads decrypted stream. |
| **Comments / structure** | Preserved in .env.up and in generated .env (headers, blank lines, comments). | Preserved in encrypted file (structure intact; values encrypted). |
| **Maturity / adoption** | Newer; focused on .env and developer UX. | Mature; widely used for Kubernetes, Terraform, GitOps (e.g. Flux, Helm). |
| **License** | MIT. | MPL-2.0. |

---

## When to use which

**Consider DotEnvUp when you want:**

- A **dedicated .env workflow**: one encrypted file (**.env.up**), lock/unlock in the editor, no plaintext .env when locked.
- **Zero cloud**: no KMS, no server, no account — keypair only at **~/.dotenvup/identity**.
- **Metadata in cleartext** (key names, versions, timestamps) without decrypting — “half-open envelope” for onboarding and diffs.
- **One keypair per machine** (or per repo) and optional multi-recipient for sharing one .env.up.
- **Tight integration** with VS Code/Cursor (status bar, one-click protect/unlock).

**Consider SOPS when you want:**

- To encrypt **many kinds of files** (YAML, JSON, .env, binary) with one tool.
- **Cloud or KMS** integration: AWS KMS, GCP KMS, Azure Key Vault, HashiCorp Vault for key management.
- **GitOps / infra**: encrypt Kubernetes secrets, Terraform variables, Helm values — commit encrypted, decrypt in CI or at deploy.
- **age or PGP** as the only key backend (no cloud).
- **Edit in place**: **sops file.yaml** opens decrypted in $EDITOR and re-encrypts on save.

---

## Summary table

| | DotEnvUp | SOPS |
|---|----------|------|
| **Encrypted file** | .env.up (single format) | Any: YAML, JSON, ENV, INI, binary |
| **Key backend** | Local only (~/.dotenvup/identity) | age, PGP, AWS/GCP/Azure/Vault KMS |
| **Commit** | .env.up ✅ | Encrypted files ✅ |
| **Editor UX** | Lock/unlock; .env appears/disappears | Typically sops edit (CLI) or community extensions |
| **App reads** | .env (when unlocked) or env from **up run** | Decrypted file or env (e.g. **sops -d** in CI) |
| **Crypto** | X25519-XChaCha20-Poly1305 | age / PGP / KMS (provider-dependent) |
| **Focus** | .env and env vars, zero cloud | Any secret file, optional cloud KMS |

**In short:** DotEnvUp is built for **.env-only**, **zero-cloud**, lock/unlock UX and editor integration. SOPS is a **general-purpose** encrypted-file editor with **multi-format** and **optional KMS**, ideal for GitOps and infra secrets.

---

## Why DotEnvUp over SOPS (for .env)

When the goal is **encrypting and using .env for app development** (not K8s manifests or Terraform), these are the arguments where DotEnvUp is a better fit:

1. **Zero cloud, zero account** — SOPS’s strength is optional **KMS** (AWS, GCP, Azure, Vault). That implies cloud, IAM, and billing. DotEnvUp needs **no server and no account**: one keypair at `~/.dotenvup/identity`, like SSH. Your key never leaves your machine. No AWS/GCP/Vault required.

2. **Lock = no .env on disk** — With DotEnvUp, **lock** literally **deletes** `.env`. “Locked” is unambiguous: there is no plaintext file. With SOPS, you encrypt the file, but there is no built-in “lock” that removes a decrypted copy; if someone runs `sops -d file.env > .env` and forgets, plaintext can stick around. DotEnvUp makes the safe state the default: when you’re not working, `.env` doesn’t exist.

3. **Editor-native, one-click** — SOPS is CLI-first: you run `sops path/to/file` or decrypt in the terminal. DotEnvUp has a **first-party VS Code/Cursor extension**: status bar, one-click unlock/lock, key management, no terminal needed. For daily .env workflow, that’s a direct UX win.

4. **See what’s inside without decrypting** — DotEnvUp’s **half-open envelope**: key names, versions, and timestamps are in **cleartext** in the `.env.up` header. You can review “which keys exist” and “who changed what when” in Git or in the IDE **without ever decrypting**. With SOPS, the same usually means decrypting or parsing encrypted blobs. For onboarding and code review, DotEnvUp gives visibility without exposing values.

5. **One keypair, one place** — DotEnvUp: **one** keypair per machine (`~/.dotenvup/identity`), shared across all projects. SOPS supports age, PGP, and multiple KMS keys; flexible, but more configuration and key management. For developers who “just want encrypted .env,” DotEnvUp’s model is simpler: same identity everywhere, like SSH.

6. **Run app without writing .env** — `up run -- npm start` decrypts and **injects** env into the process; **no .env file is ever written**. Ideal for CI and local “run with secrets.” SOPS can do similar with `sops -d` and piping, but DotEnvUp is built around this use case and keeps the surface small.

7. **Purpose-built for .env** — SOPS is **general-purpose** (YAML, JSON, .env, binary) and excels at GitOps and infra. DotEnvUp is **only .env**: one format, one workflow, one key location. If you only care about app env vars, DotEnvUp avoids the extra concepts (multiple backends, multiple formats, `.sops.yaml` config).

Use these when explaining “why DotEnvUp” to a team that is considering SOPS purely for .env: **no cloud, lock = delete, editor one-click, visible metadata, simpler key story, run without file, .env-only.**
