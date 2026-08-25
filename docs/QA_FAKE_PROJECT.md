# Fake Project QA Harness

This QA harness validates multi-recipient and recovery behavior with **fully isolated test identities**.

It never touches your real `~/.dotenvup` keys.

## What it checks

### Legacy harness (`qa-fake-project.sh`)

1. Creates fake project `.env`.
2. Creates isolated user identities:
   - Alice (owner)
   - Bob (recipient)
   - Charlie (no matching key; recovery flow)
3. Adds Bob as recipient.
4. Encrypts `.env` as Alice.
5. Decrypts same `.env.up` as Bob (proves multi-recipient works).
6. Runs key recovery scan as Charlie.

### Policy harness (`qa-fake-project-policy.sh`)

Subset ACL, Bob merge without wiping Alice-only keys, owner shared-key sync, `up recipients remove`, CI `up run`, and `up verify`. Isolated identities under `.qa-fake-project-policy/` (gitignored). Spec: [design/TEAM_SECRETS_TEST_PLAN.md](design/TEAM_SECRETS_TEST_PLAN.md) §6.2.

## Run

From repo root:

```bash
npm run build --workspace @dotenvup/format
npm run build --workspace @dotenvup/cli
bash ./qa-fake-project.sh
bash ./qa-fake-project-policy.sh   # [policy] subsets + merge import
```

Optional custom QA workspace path:

```bash
DOTENVUP_QA_ROOT=/tmp/dotenvup-qa bash ./qa-fake-project.sh
```

## Safety guarantees

- Uses isolated env vars for identity location:
  - `DOTENVUP_TEST=1`
  - `DOTENVUP_NO_PROMPT=1` (no nickname / recovery prompts in CI or Cursor terminal)
  - `DOTENVUP_IDENTITY_DIR`
  - `DOTENVUP_TEST_IDENTITY_DIR`
  - `HOME` / `USERPROFILE`
- Harness runs `up init --yes` with stdin from `/dev/null` so a TTY never blocks automation.
- Stores all generated data under `.qa-fake-project/` (or your custom path).

