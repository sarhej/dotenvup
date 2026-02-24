<p align="center">
  <img src="docs/assets/logo-dark.svg" alt="DotEnvUp Logo" width="128" height="128" />
</p>

# DotEnvUp

> `.env` files, but with memory — and a lock.

An encrypted `.env` file format (`.env.up`) and tooling that makes secrets safe by default — without changing how developers work.

- **Encrypted at rest** — values, comments, and structure are encrypted on disk. No more plaintext secrets.
- **Comments preserved** — your `# Database`, blank lines, and commented-out secrets survive encrypt/decrypt.
- **Metadata you've always wanted** — each key tracks its origin, timestamp, version, and author.
- **Lock/unlock** — one button to decrypt temporarily. Auto-locks when you're done.
- **Zero code changes** — existing `dotenv` libraries, `process.env`, everything works unchanged.
- **Safe to commit** — `.env.up` files can live in git. Only metadata is visible, values are encrypted.
- **Cross-IDE** — keys at `~/.dotenvup/identity` work across VS Code, Cursor, CLI, and any tool.

For seamless team sharing: **[unknownpassword.com](https://unknownpassword.com)**.

## How It Works

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Ext as Extension / CLI
    participant FS as File System
    participant Key as ~/.dotenvup/identity

    Dev->>Ext: Click "Protect .env" (or: up import + up lock)
    Ext->>Key: Has keypair?
    alt No keypair
        Ext->>Key: Generate & save keypair (chmod 600)
        Ext-->>Dev: Show consent / explain key storage
    end
    Ext->>FS: Read .env (with all comments)
    Ext->>FS: Write .env.up (encrypted values, cleartext keys & comments)
    Ext->>FS: Verify .env.up decrypts correctly
    Ext->>FS: Delete .env
    Ext-->>Dev: Status: "Locked"

    Dev->>Ext: Click "Unlock" (or: up unlock 5m)
    Ext->>Key: Load private key
    Ext->>FS: Read .env.up → decrypt
    Ext->>FS: Write .env (atomic, with original comments)
    Ext-->>Dev: Status: "Unlocked (auto-locks in 5m)"
```

### Before & After

```mermaid
graph TD
    subgraph " Before DotEnvUp"
        A[".env in project<br/>❌ Plaintext secrets on disk<br/>❌ Gitignored — no backup<br/>❌ Shared via Slack / email"]
    end
    subgraph " With DotEnvUp"
        B[".env.up committed to git<br/>✅ Values encrypted<br/>✅ Key names visible (replaces .env.example)<br/>✅ Comments & structure preserved"]
        C[".env appears only when unlocked<br/>⏱ Auto-locks after timer"]
    end
    A -->|"up import + lock"| B
    B -->|"unlock"| C
    C -->|"lock"| B
```

## Packages

| Package | Description | npm |
|---|---|---|
| [`@dotenvup/format`](./packages/format) | Core `.env.up` format parser & writer | [![npm](https://img.shields.io/npm/v/@dotenvup/format)](https://www.npmjs.com/package/@dotenvup/format) |
| [`@dotenvup/node`](./packages/node) | Drop-in `dotenv` replacement for Node.js | [![npm](https://img.shields.io/npm/v/@dotenvup/node)](https://www.npmjs.com/package/@dotenvup/node) |
| [`@dotenvup/cli`](./packages/cli) | CLI tool (`up lock`, `up unlock`, `up run`) | [![npm](https://img.shields.io/npm/v/@dotenvup/cli)](https://www.npmjs.com/package/@dotenvup/cli) |
| [DotEnvUp Extension](./packages/vscode-dotenvup) | VS Code / Cursor extension — local secret management | [Download .vsix (v0.3.0)](https://github.com/sarhej/dotenvup/releases/download/v0.3.0/dotenvup-0.3.0.vsix) |

## The `.env.up` Format

An encrypted `.env` with visible metadata — a "half-open envelope":

```mermaid
graph LR
    subgraph ".env.up file"
        H["🔓 Header — cleartext<br/>─────────────<br/>Key names &amp; comments<br/>Timestamps &amp; versions<br/>Author / Key-Id"]
        V["🔒 Values — encrypted<br/>─────────────<br/>XChaCha20-Poly1305<br/>Base64 ciphertext<br/>Requires private key"]
    end
    H --- V
    style H fill:#1e293b,stroke:#3DDC84,color:#e2e8f0
    style V fill:#1e293b,stroke:#ef4444,color:#e2e8f0
```

```ini
#!dotenvup v1
# Encrypted-By: @alice
# Encrypted-For: @bob, @charlie

[keys]
DB_HOST          v3  2026-02-10T08:00:00Z  @alice    staging cluster
DB_PASSWORD      v5  2026-02-15T10:30:00Z  @alice    # rotated
API_KEY          v2  2026-02-01T00:00:00Z  @alice    test key

[encrypted]
recipient:@bob    nonce:abc123... payload:SGVsbG8g...
```

You can see **what's inside** (key names, versions, timestamps) without decrypting. The actual values — and the original `.env` content including all comments — are encrypted per-recipient.

**Full details:** [Security Model](docs/SECURITY.md) · [User Guide](docs/USER_GUIDE.md)

## Key Storage

Keys are stored at `~/.dotenvup/identity` — works across every IDE and the CLI.

```mermaid
flowchart LR
    App["Extension / CLI"] --> E
    E["1. UP_KEY env var<br/>(CI / Docker)"]
    E -->|not found| F["2. ~/.dotenvup/identity<br/>(cross-IDE, default)"]
    F -->|not found| L["3. Legacy VS Code secrets<br/>(auto-migrated)"]
    style E fill:#1e293b,stroke:#3DDC84,color:#e2e8f0
    style F fill:#1e293b,stroke:#7c3aed,color:#e2e8f0
    style L fill:#1e293b,stroke:#64748b,color:#e2e8f0
```

## Documentation

- [User Guide](docs/USER_GUIDE.md) — Commands, workflows, drift explained
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common errors, identity file and recovery issues
- [Security Model](docs/SECURITY.md) — What is encrypted, threat model
- [File Type Registration](docs/FILE_TYPE.md) — MIME types, UTI, icons for OS integration
- [Roadmap](docs/ROADMAP.md) — Extension hardening, native installers, OS file type registration
- [Publishing to the Marketplace](docs/PUBLISHING.md) — How to publish the VS Code extension (maintainers)

## Install

### VS Code / Cursor Extension (recommended)

Download the `.vsix` from [Releases](https://github.com/sarhej/dotenvup/releases) ([v0.3.0](https://github.com/sarhej/dotenvup/releases/tag/v0.3.0)), then:

```bash
# VS Code
code --install-extension dotenvup-0.3.0.vsix

# Cursor
cursor --install-extension dotenvup-0.3.0.vsix
```

Or in the editor: **Extensions** → `...` menu → **Install from VSIX...** → select the file.

Once installed, click the status bar button to protect your `.env` — no CLI needed.

### CLI

```bash
npm install -g @dotenvup/cli
```

## Quick Start

### Extension (one click)

1. Open a project that has a `.env` file
2. Click the **lock icon** in the status bar (bottom-right)
3. First time: consent screen explains key storage → click **"Protect My .env"**
4. Done — `.env` is encrypted into `.env.up` and deleted

To unlock: click the status bar again → choose a duration → `.env` reappears.

### CLI

```bash
up init            # Generate keypair (stored at ~/.dotenvup/identity)
up import .env     # Encrypt .env → .env.up (comments preserved!)
up lock            # Delete plaintext .env
up unlock 5m       # Decrypt for 5 minutes (with original comments)
up run -- npm start  # Run with decrypted env vars (no file on disk)
```

## Automation and AI Agents

Use `up run -- <command>` to run any command with decrypted env vars — no `.env` file is written to disk.

```bash
up run -- npm test
up run -- npm start
up status --json        # Machine-readable lock state
```

For scripts, CI, and AI coding agents, see **[AGENTS.md](AGENTS.md)**.

Agent-specific context files: **[CLAUDE.md](CLAUDE.md)** (Claude Code), **[GEMINI.md](GEMINI.md)** (Google Gemini).

## Development

```bash
npm install
npm run build
npm run test    # 110 tests across format, safety, and crypto
```

## License

MIT — see [LICENSE](./LICENSE).
