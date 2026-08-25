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
| **Same payload for every recipient** | Yes — legacy `encrypt()` without `[policy]` |
| **`[policy]` section** | Yes — parser, serializer, validate |
| **Filtered payload per recipient** | Yes — policy-aware `encrypt()` |
| **Merge re-encrypt** | Yes — `mergeReencrypt`, `up import` when `.env.up` exists |
| **`up reencrypt`** | Yes — full re-wrap after recipient/policy changes |
| **`up recipients remove`** | Yes — revokes `[policy]` row + encrypted block when `[policy]` present |

---

## Not in v1 (deferred)

- **`up lock` merge path** — lock still deletes `.env`; use `up import` to persist edits to `.env.up`
- **Signed `[policy]`** — cleartext policy is trusted; use `up verify` + review

---

## Historical target (now shipped — see table above)

Cleartext `[policy]`, per-recipient filtered payloads, merge re-encrypt on import, and `up verify` — all shipped. Spec and gates: [TEAM_SECRETS_SPEC_ADDENDUM.md](./TEAM_SECRETS_SPEC_ADDENDUM.md) · [TEAM_SECRETS_TEST_PLAN.md](./TEAM_SECRETS_TEST_PLAN.md) · [TEAM_SECRETS_SECURITY.md](./TEAM_SECRETS_SECURITY.md).

---

## Code pointers

| Area | Path |
|------|------|
| Encrypt / decrypt | `packages/format/src/crypto.ts` |
| Recipients config | `packages/format/src/recipientsConfig.ts` |
| CLI import | `packages/cli/src/commands/import.ts` |
| Multi-recipient QA | `qa-fake-project.sh` |
| Format spec (v1) | `docs/FORMAT_SPEC.md` §2.6 (`[policy]`), §2.7, §4 |
