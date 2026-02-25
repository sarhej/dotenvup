# DotEnvUp vs dotenvx

A concise comparison of **DotEnvUp** (this project) and **[dotenvx](https://github.com/dotenvx/dotenvx)** (“a secure dotenv” from the creator of the original `dotenv`). Both aim to improve .env security; they differ in format, workflow, and where they run.

---

## One-line positioning

| | DotEnvUp | dotenvx |
|---|----------|--------|
| **Tagline** | “.env files, but with memory — and a lock.” | “A secure dotenv” — run anywhere, multi-env, encrypted envs. |
| **Core idea** | Encrypted **.env.up** file; unlock temporarily to get a normal **.env**; lock removes it. App code unchanged. | **.env** stays in repo with encrypted values; **dotenvx run** decrypts and injects at runtime. No plaintext .env on disk in prod. |

---

## Format and files

| Aspect | DotEnvUp | dotenvx |
|--------|----------|--------|
| **Main file** | **.env.up** — new format: cleartext header (key names, versions, timestamps) + encrypted value blocks. | **.env** — same filename; values stored as `KEY="encrypted:...";` public key in file. |
| **Key storage** | **~/.dotenvup/identity** (one keypair per machine; shared across projects). Optional per-repo keys. | **.env.keys** (gitignored) — holds `DOTENV_PRIVATE_KEY` per env file. |
| **Safe to commit?** | Yes. **.env.up** can be committed; only metadata is visible; values are encrypted. | Partially. **.env** with `encrypted:...` and `DOTENV_PUBLIC_KEY` can be committed; **.env.keys** must not be. |
| **Plaintext .env** | Created only when “unlocked”; deleted on lock or timer. | Not written by default; decryption happens in process via `dotenvx run`. |

---

## Security model

| Aspect | DotEnvUp | dotenvx |
|--------|----------|--------|
| **Crypto** | X25519-XChaCha20-Poly1305 (per-recipient). | ECIES + AES-256. |
| **Key model** | Single user keypair (or per-repo); multi-recipient support in .env.up. | Per-file or per-environment keypair; public key in .env, private in .env.keys. |
| **What’s visible in repo** | Key names, versions, timestamps, authors — no values. | Key names and `encrypted:...` blobs; public key in file. |
| **Runtime secret exposure** | Plaintext only in memory and (if unlocked) in .env on disk until lock. | No .env file by default; secrets injected by CLI into process env. |

---

## Developer workflow

| Aspect | DotEnvUp | dotenvx |
|--------|----------|--------|
| **Encrypt** | Extension: “Protect .env” / Import. CLI: `up import .env` → .env.up, then `up lock` (removes .env). | CLI: `dotenvx encrypt` (rewrites .env in place with encrypted values). |
| **Decrypt / use locally** | Extension: “Unlock” (writes .env for a duration or until close). CLI: `up unlock 5m` or `up run -- npm start`. | CLI: `dotenvx run -- node index.js` (decrypts and injects; no .env file needed). |
| **App code** | Unchanged. App and existing `dotenv` libs read **.env** when present. | Unchanged. App uses `process.env`; **dotenvx run** injects env before starting the process. |
| **Production** | Set `UP_KEY` (or key material) in env; use `up run -- your-app` so no .env is written. Or unlock in a controlled environment. | Set `DOTENV_PRIVATE_KEY` (or per-env key); run `dotenvx run -- your-app`; no .env.keys in deployment. |
| **Multi-environment** | Multiple .env.up or multiple files; CLI/extension can target different files. | Native: .env, .env.production, .env.local, etc., each with its own key in .env.keys. |

---

## VS Code / editor

| Aspect | DotEnvUp | dotenvx |
|--------|----------|--------|
| **Extension** | **DotEnvUp** (VS Code Marketplace, Open VSX). Status bar lock/unlock, init, import, key management, recovery. | **dotenvx-vscode** (Open VSX). Integrates with dotenvx CLI for encrypt/run. |
| **Primary UX** | One-click lock/unlock; .env appears and disappears; optional timer. | Encrypt/decrypt and run from editor using dotenvx under the hood. |
| **Key storage** | ~/.dotenvup/identity (shared with CLI). | Typically .env.keys in project (or env vars). |

---

## CLI and ecosystem

| Aspect | DotEnvUp | dotenvx |
|--------|----------|--------|
| **CLI name** | `up` (`@dotenvup/cli`). | `dotenvx`. |
| **Install** | `npm install -g @dotenvup/cli`. | `npm i @dotenvx/dotenvx`, or curl/brew/docker/winget. |
| **Run without .env on disk** | `up run -- node index.js` (decrypt in process, inject, no .env). | `dotenvx run -- node index.js` (same idea). |
| **Cross-platform / any language** | `up run` works for any process; env is injected by the CLI. | Strong focus: “run anywhere” — any language/framework via `dotenvx run`. |
| **Comments / structure** | Preserved in .env.up and in the generated .env (headers, blank lines, comments). | Encrypted .env is key-value focused; structure may differ. |
| **Commercial / team** | UnknownPassword (future) for sharing and team features. | dotenvx Pro (keypair management, etc.). |

---

## When to use which

**Consider DotEnvUp when you want:**

- A **separate** encrypted file (**.env.up**) that’s safe to commit, with a clear “lock = no .env on disk” model.
- **Unlock in the editor** and work with a normal .env for a while, then lock again.
- **Metadata in cleartext** (key names, versions, timestamps) without decrypting.
- **One keypair per machine** (or per repo) and optional multi-recipient .env.up.
- **Comments and structure** preserved through encrypt/decrypt.

**Consider dotenvx when you want:**

- To keep using the **.env** filename and have encryption **inside** that file.
- **Multi-environment** (.env, .env.production, …) with per-file keys and a mature CLI.
- **“Run anywhere”** — same CLI and flow across languages and platforms.
- **No plaintext .env** on disk in prod; decryption only at run via `dotenvx run`.
- Ecosystem from the **creator of dotenv** and a large community (e.g. 5k+ GitHub stars).

---

## Summary table

| | DotEnvUp | dotenvx |
|---|----------|--------|
| **Encrypted file** | .env.up (new format) | .env (encrypted values inline) |
| **Key file** | ~/.dotenvup/identity | .env.keys (per project/env) |
| **Commit** | .env.up ✅ | .env ✅, .env.keys ❌ |
| **Editor UX** | Lock/unlock; .env appears/disappears | Encrypt/run with CLI |
| **App reads** | .env (when unlocked) or env from `up run` | process.env (injected by dotenvx run) |
| **Crypto** | X25519-XChaCha20-Poly1305 | ECIES, AES-256 |
| **Open source** | MIT (DotEnvUp) | MIT (dotenvx) |

Both are valid “secure .env” options; DotEnvUp is built around a dedicated **.env.up** format and lock/unlock UX, while dotenvx keeps the **.env** name and centers on **dotenvx run** and multi-environment encryption.
