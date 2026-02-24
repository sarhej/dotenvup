# Fake Project QA Harness

This QA harness validates multi-recipient and recovery behavior with **fully isolated test identities**.

It never touches your real `~/.dotenvup` keys.

## What it checks

1. Creates fake project `.env`.
2. Creates isolated user identities:
   - Alice (owner)
   - Bob (recipient)
   - Charlie (no matching key; recovery flow)
3. Adds Bob as recipient.
4. Encrypts `.env` as Alice.
5. Decrypts same `.env.up` as Bob (proves multi-recipient works).
6. Runs key recovery scan as Charlie.

## Run

From repo root:

```bash
npm run build --workspace @dotenvup/format
npm run build --workspace @dotenvup/cli
bash ./qa-fake-project.sh
```

Optional custom QA workspace path:

```bash
DOTENVUP_QA_ROOT=/tmp/dotenvup-qa bash ./qa-fake-project.sh
```

## Safety guarantees

- Uses isolated env vars for identity location:
  - `DOTENVUP_TEST=1`
  - `DOTENVUP_IDENTITY_DIR`
  - `DOTENVUP_TEST_IDENTITY_DIR`
  - `HOME` / `USERPROFILE`
- Stores all generated data under `.qa-fake-project/` (or your custom path).

