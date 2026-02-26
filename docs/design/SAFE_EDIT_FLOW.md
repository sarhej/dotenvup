# Safe Edit — Edit `.env.up` in place

This feature lets you edit environment variables in a **virtual document** without writing a plaintext `.env` to disk. The extension decrypts on read and re-encrypts on save, using the Keystore; the real `.env.up` file stays encrypted at all times.

## Flow overview

```mermaid
flowchart TB
    subgraph Initiation[" "]
        User([User])
        User -->|"Click CodeLens / Status Bar"| Cmd["Command: safeEdit"]
        Cmd -->|"Open Virtual Doc"| Virtual["Virtual doc: dotenvup-safe:/.env"]
    end

    subgraph Provider["Safe Edit Provider"]
        Editor["VS Code Editor"]
        FS["SafeEditFSProvider"]
        Disk[("Disk: .env.up")]
        Key[(Keystore)]

        Virtual --> FS

        subgraph Read["Read flow"]
            R1["1. Read .env.up"]
            R2["2. Decrypt (memory)"]
            FS --> R1 --> Disk
            R1 --> R2 --> Key
            R2 --> Editor
        end

        subgraph Save["Save flow"]
            S1["1. Encrypt content"]
            S2["2. Update .env.up"]
            Editor -->|"Save (Cmd+S)"| FS
            FS --> S1 --> Key
            S1 --> S2 --> Disk
        end
    end
```

## Read flow (open for editing)

When you open the virtual document (`dotenvup-safe:/.env`):

1. **SafeEditFSProvider** receives `Read dotenvup-safe:/.env`.
2. It **reads** the real `.env.up` file from disk.
3. It **decrypts** in memory using the **Keystore** (no plaintext file).
4. The decrypted content is shown in the **VS Code Editor**.

```mermaid
sequenceDiagram
    participant User
    participant Editor as VS Code Editor
    participant FS as SafeEditFSProvider
    participant Disk as .env.up
    participant Key as Keystore

    User->>Editor: Click CodeLens / Status Bar → safeEdit
    Editor->>FS: Read dotenvup-safe:/.env
    FS->>Disk: 1. Read .env.up
    Disk-->>FS: Encrypted content
    FS->>Key: 2. Decrypt (memory)
    Key-->>FS: Plaintext
    FS-->>Editor: Show decrypted content
    Editor->>User: Edit in place
```

## Save flow (persist changes)

When you save (e.g. Cmd+S):

1. **Editor** sends the current plaintext to **SafeEditFSProvider**.
2. Provider **encrypts** the content via the **Keystore**.
3. Provider **writes** the result to **.env.up** on disk.

```mermaid
sequenceDiagram
    participant User
    participant Editor as VS Code Editor
    participant FS as SafeEditFSProvider
    participant Key as Keystore
    participant Disk as .env.up

    User->>Editor: Save (Cmd+S)
    Editor->>FS: 3. Return plaintext
    FS->>Key: 1. Encrypt content
    Key-->>FS: Ciphertext
    FS->>Disk: 2. Update .env.up
    Disk-->>FS: Done
    FS-->>Editor: Saved
```

## Summary

| Step   | Where        | Action |
|--------|--------------|--------|
| Open   | SafeEditFSProvider | Read `.env.up` → Decrypt with Keystore → Show in editor |
| Edit   | VS Code Editor      | User edits; content stays in memory / virtual doc |
| Save   | SafeEditFSProvider | Encrypt with Keystore → Write to `.env.up` |

Plaintext never touches disk; only the encrypted `.env.up` file is stored.
