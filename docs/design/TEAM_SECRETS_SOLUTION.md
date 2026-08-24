# Team secrets — agreed solution (DotEnvUp + UnknownPassword)

> **Status:** Design agreed — **not fully implemented**.  
> **Canonical doc** for sharing, policy, and team workflow.  
> **Spec today:** [FORMAT_SPEC.md](../FORMAT_SPEC.md) (v1). **Implementation map:** [SHARING_MODEL.md](./SHARING_MODEL.md).

---

## Summary

One **`.env.up`** in git. **Cleartext** header + `[keys]` catalog (all key names — the half-open essence). Optional **`[policy]`** block: which recipient gets which keys (values only). **`[encrypted]`**: one block per recipient, each with a **filtered** JSON payload (only that recipient’s values). Anyone who can **decrypt** may **edit and re-encrypt** for the **same recipients**; **merge** rules prevent wiping secrets they never saw. **Git** tracks who changed the file. **No read-only roles** in the tool. **UnknownPassword** is optional UX for policy, pub keys, and apply workflow — **not** required at `up run` time.

---

## Principles

| Principle | Meaning |
|-----------|---------|
| **Half-open envelope** | Key names, versions, authors, timestamps stay **cleartext** in git. Replaces `.env.example` with an auditable catalog. We do **not** hide key names per user. |
| **ACL on values only** | Policy + ciphertext define who gets which **values**. Everyone sees the same key **names**. |
| **Decrypt → edit → re-encrypt** | If your key opens a block, you may unlock, edit what you see, `import` / lock. No special “owner-only” import in the tool. |
| **Git is the audit trail** | Who changed `.env.up` and when is version control, not a DotEnvUp permission bit. |
| **Same recipients on re-encrypt** | After an edit, keep the recipient set from the file (header / `[policy]` / existing blocks). |
| **Merge, don’t wipe** | Re-encrypt updates keys you edited; **preserves** ciphertext for keys/recipients you could not decrypt. |
| **UP optional at runtime** | `up run`, unlock, agents work offline with local key + file. UP helps when **policy or membership** changes. |

---

## File shape (target)

```ini
#!dotenvup v1
# Encrypted-By: @alice
# Created: 2026-08-24T20:00:00Z
# Algorithm: x25519-xchacha20-poly1305
# Encrypted-For: @alice, @bob, @ci
# Key-Id: 066g6-qvv3E

[keys]
DB_HOST          v1  2026-08-20T10:00:00Z  @alice
API_KEY          v3  2026-08-24T12:00:00Z  @alice
PROD_DB_URL      v1  2026-08-20T10:00:00Z  @alice
JWT_SECRET       v1  2026-08-20T10:00:00Z  @alice

[policy]
version: 1
recipient:@alice  keys:DB_HOST,API_KEY,PROD_DB_URL,JWT_SECRET
recipient:@bob    keys:DB_HOST,API_KEY
recipient:@ci     keys:API_KEY

[encrypted]
recipient:@alice  identity:github:alice-dev  nonce:...  ephemeral:...  payload:...
recipient:@bob    identity:github:bob-eng    nonce:...  ephemeral:...  payload:...
recipient:@ci     nonce:...  ephemeral:...  payload:...
```

**Section order:** header → `[keys]` → `[policy]` (optional) → `[signature]` (optional, v2) → `[encrypted]`.

### `[policy]` rules (normative when present)

- Declares, in cleartext, which key **names** each recipient may have **values** for.
- **Encrypt** MUST build each `recipient:` payload from that recipient’s key list only.
- **Verify** on import (recommended): decrypted keys ⊆ policy ⊆ `[keys]` catalog; mismatch → fail or warn.
- **Absent `[policy]`** → legacy behavior: every recipient block contains **all** keys (v1 today).

Parsers **MUST ignore** unknown sections → old tools keep reading files that add `[policy]`.

---

## What exists today vs target

| Capability | v1 shipped | Target |
|------------|------------|--------|
| Multiple `recipient:` blocks | Yes | Yes |
| Each person decrypts with own key | Yes | Yes |
| Same JSON in every block | **Yes (today)** | **No** — filtered per `[policy]` |
| `[policy]` section | No | Yes (optional, backward compatible) |
| Merge re-encrypt | No | Yes |
| `up recipients add` + `import` | Yes (manual) | Yes + policy-aware encrypt |

See [SHARING_MODEL.md](./SHARING_MODEL.md) for code pointers and QA (`qa-fake-project.sh`).

---

## Workflows

### Solo (no team)

- One recipient (`@local`). Omit `[policy]`.
- `up init` → `import` → `lock` / `up run --`. Unchanged.

### Add a teammate

1. Teammate has a DotEnvUp keypair (public key shared).
2. Add to `.dotenvup.recipients.json` and/or `[policy]` + `Encrypted-For`.
3. **Re-encrypt** (`up import` or extension lock) so their `[encrypted]` block exists with the correct key subset.
4. Commit `.env.up`. Teammate clones → `up unlock` or `up run --`.

### Daily use

```
.env.up → decrypt my block → values for my policy slice
       → up run -- cmd     (no .env on disk)
       → up unlock         (optional; writes .env with my slice only)
```

`up keys` / header: full **catalog** (names). Agents: metadata ≠ access to values.

### Edit and re-encrypt (anyone who can decrypt)

1. Unlock → `.env` contains **only keys in your decrypted payload**.
2. Edit keys you can see.
3. Import / lock → re-encrypt **all recipients** still in the file.
4. **Merge:** keys you did not have in plaintext stay as in the previous `.env.up` (other blocks / other keys unchanged).

Example: Bob has 8 keys; he changes 2. Import updates Bob’s block for those 2; Alice’s block and Alice-only keys are **not** deleted.

### Revoke someone

Re-encrypt **without** their `recipient:` line (and remove from `[policy]` / `Encrypted-For`). Their key no longer opens any block.

---

## UnknownPassword (optional layer)

| UP helps with | OSS without UP |
|---------------|----------------|
| Team directory → recipient ids + pub keys | Paste `.pub` / `up recipients add` |
| UI to edit `[policy]` and trigger re-encrypt | Hand-edit `[policy]` + `import` |
| Share links (`sealedShare` + API) | Extension Receive Share |
| Compliance / audit UX | Git log + cleartext `[keys]` / `[policy]` |

UP does **not** need to be online for `up run`. Zero-knowledge: UP sees policy, pub keys, ciphertext — not plaintext.

---

## DotEnvUp OSS responsibilities

| Owns | Does not own |
|------|----------------|
| Format, encrypt/decrypt, merge re-encrypt | Team directory (UP) |
| Local identity `~/.dotenvup/` | Mandatory cloud account |
| `up import`, `unlock`, `run`, extension, MCP | Read-only role enforcement |
| Parse optional `[policy]`; verify when present | Hiding key names |

---

## Backward compatibility

| File | Behavior |
|------|----------|
| No `[policy]` | All recipients get full payload (current v1). |
| `[policy]` + old reader | Ignores policy section; decrypts block as-is. |
| `[policy]` + new writer | Filtered payloads + verify. |

Optional magic `#!dotenvup v2` later for signatures; `[policy]` can ship on v1-compatible parsers first.

---

## Orthogonal: metadata signing (FORMAT v2)

[v2 header `[signature]`](./FORMAT_V2.md) — tamper-evident **catalog + policy**, not value ACL. Complements git commit signing. Independent of team subset crypto.

---

## Implementation checklist (when coding)

**Gate:** Complete spec + test plan + security review before feature code ([TEAM_SECRETS_SPEC_ADDENDUM.md](./TEAM_SECRETS_SPEC_ADDENDUM.md), [TEAM_SECRETS_TEST_PLAN.md](./TEAM_SECRETS_TEST_PLAN.md), [TEAM_SECRETS_SECURITY.md](./TEAM_SECRETS_SECURITY.md)).

1. **Tests first** — parser/policy validation, encrypt subset, `_raw` filter (R1/R2), merge (MRG-*).
2. **`encrypt()`** — one JSON payload per recipient from policy.
3. **`import` / Safe Edit** — merge re-encrypt; never drop unknown ciphertext.
4. **CLI** — `up verify` (structural + optional decrypt checks; no values in output).
5. **Extension** — same merge path as CLI.
6. **QA** — `qa-fake-project-policy.sh` + doc update.
7. **UnknownPassword** — edit policy + orchestrate re-encrypt (separate product).

---

## Non-goals

- Hide key names per user in the same repo file.
- UP API on every `up run`.
- Tool-enforced read-only members.
- Replace git with DotEnvUp audit.

---

## Related docs

- [SHARING_MODEL.md](./SHARING_MODEL.md) — today’s code vs this target  
- [TEAM_SECRETS_SPEC_ADDENDUM.md](./TEAM_SECRETS_SPEC_ADDENDUM.md) — normative `[policy]` + merge rules  
- [TEAM_SECRETS_TEST_PLAN.md](./TEAM_SECRETS_TEST_PLAN.md) — test matrix (pre-code gate)  
- [TEAM_SECRETS_SECURITY.md](./TEAM_SECRETS_SECURITY.md) — threat model  
- [FORMAT_SPEC.md](../FORMAT_SPEC.md) — v1 normative spec  
- [FORMAT_V2.md](./FORMAT_V2.md) — metadata signatures (separate track)  
- [USER_GUIDE.md](../USER_GUIDE.md) — user-facing recipient workflow  
