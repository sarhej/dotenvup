# Sharing — implementation status

> **Solution design:** [TEAM_SECRETS_SOLUTION.md](./TEAM_SECRETS_SOLUTION.md) (canonical).  
> **This file:** what is **shipped in v1** vs what the solution still needs.

---

## Shipped today (v1)

| Feature | Status |
|---------|--------|
| Per-recipient `[encrypted]` blocks | Yes — `packages/format/src/crypto.ts` |
| Each teammate decrypts with own key | Yes — `decryptAny()`, `qa-fake-project.sh` |
| Add recipient + re-import | Yes — `up recipients`, `up import` |
| GitHub SSH → recipient | Yes — extension `Encrypt for GitHub User` |
| Sealed one-off share | Yes — `sealedShare.ts`, `receiveShare.ts` |
| **Same payload for every recipient** | Yes — current `encrypt()` |
| **`[policy]` section** | **No** |
| **Filtered payload per recipient** | **No** |
| **Merge re-encrypt** | **No** |

---

## Target (see TEAM_SECRETS_SOLUTION.md)

- Optional cleartext `[policy]` in the same `.env.up`
- Each `recipient:` block encrypts only that recipient’s key names from policy
- Re-import merges edits without wiping keys the editor never decrypted
- No read-only roles — git audit only

---

## Code pointers

| Area | Path |
|------|------|
| Encrypt / decrypt | `packages/format/src/crypto.ts` |
| Recipients config | `packages/format/src/recipientsConfig.ts` |
| CLI import | `packages/cli/src/commands/import.ts` |
| Multi-recipient QA | `qa-fake-project.sh` |
| Format spec (v1) | `docs/FORMAT_SPEC.md` §2.6, §4 |
