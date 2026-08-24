# Team secrets — spec addendum (`[policy]` + merge re-encrypt)

> **Status:** Normative draft for implementation and tests. **Not shipped.**  
> **Parent:** [TEAM_SECRETS_SOLUTION.md](./TEAM_SECRETS_SOLUTION.md) · **Base spec:** [FORMAT_SPEC.md](../FORMAT_SPEC.md) (v1).

This addendum defines optional `[policy]`, per-recipient filtered ciphertext, verification, and merge re-encrypt. Parsers that do not implement it MUST ignore `[policy]` and behave as v1.

---

## 1. Section placement

When present, section order is:

```
header → [keys] → [policy] → [signature] (optional v2) → [encrypted]
```

`[policy]` is **optional**. Absent `[policy]` ⇒ **legacy mode** (§8).

---

## 2. `[policy]` grammar

### 2.1 Section header

```ini
[policy]
```

Case-sensitive. Exactly one `[policy]` section per file (if multiple appear, parsers SHOULD use the first and MAY warn).

### 2.2 Lines

| Line | Form | Required |
|------|------|----------|
| Version | `version: <positive-int>` | Yes when `[policy]` present |
| Recipient row | `recipient:<id>  keys:<key-list>` | One per recipient in policy |

- `<id>` — same rules as `recipient:` in `[encrypted]` (e.g. `@alice`, `teammate`). Leading `@` is conventional, not required.
- `<key-list>` — comma-separated key names **without spaces** (e.g. `DB_HOST,API_KEY`). Empty list is invalid.
- Whitespace between `recipient:<id>` and `keys:` is flexible; parsers split on the first `keys:` token.
- Comment lines (`# …`) and blank lines inside `[policy]` MUST be ignored.

**Supported `version` today:** `1`. Unknown version ⇒ parsers MUST reject write; readers MAY ignore `[policy]` and treat file as legacy (warn recommended).

### 2.3 Example

```ini
[policy]
version: 1
recipient:@alice  keys:DB_HOST,API_KEY,PROD_DB_URL,JWT_SECRET
recipient:@bob    keys:DB_HOST,API_KEY
recipient:@ci     keys:API_KEY
```

---

## 3. Consistency rules (normative)

When `[policy]` is present, writers and `up verify` MUST enforce:

| Rule | ID | Description |
|------|-----|-------------|
| **Catalog ⊆ keys** | P1 | Every name in any `keys:` list MUST appear in `[keys]`. |
| **Recipients ⊆ policy** | P2 | Every `recipient:` in `[encrypted]` MUST have a matching `recipient:<id>` row in `[policy]`. |
| **Policy ⊆ recipients** | P3 | Every `recipient:` row in `[policy]` MUST have a matching `[encrypted]` block (same `<id>`). |
| **Header alignment** | P4 | `Encrypted-For` SHOULD list the same recipient ids as `[policy]` (order MAY differ). Mismatch ⇒ verify warning or error (configurable; default **error** on `up verify`). |
| **Unique ids** | P5 | Recipient ids unique within `[policy]` and within `[encrypted]`. |

Legacy mode (no `[policy]`): P1–P5 do not apply; all recipients receive the full entry map (current v1).

---

## 4. Encrypt (normative)

Given plaintext entries `E`, optional raw `.env` string `R`, recipient public keys `K`, and optional policy `Π`:

### 4.1 Legacy mode (no `[policy]`)

For each `(recipient, pubKey) ∈ K`, build JSON payload:

```json
{ ...E, "_raw": "<R>" }
```

(`_raw` omitted if `R` was not provided.) Same logical payload for every recipient (current behavior).

### 4.2 Policy mode (`[policy]` present)

For each `recipient:<id> keys:L` in `Π`:

1. Let `L` be the ordered set of key names from the row.
2. Build `E_id = { k → E[k] | k ∈ L }` (only keys in `L`).
3. Build `R_id` — see §5 (`_raw` per recipient).
4. JSON payload: `{ ...E_id, "_raw": "<R_id>" }` if `R_id` is defined; else `E_id` only.
5. Seal payload for `id` with `pubKey` from `K`.

**MUST NOT** include in recipient `id`'s payload any key name ∉ `L`.

**MUST** produce exactly one `[encrypted]` block per policy row (P3).

---

## 5. `_raw` per recipient (security-critical)

The reserved `_raw` field stores the original `.env` text. In policy mode:

| Rule | ID | Description |
|------|-----|-------------|
| **Filter raw** | R1 | `_raw` for recipient `id` MUST contain only lines/entries for keys in that recipient's `keys:` list. Comments that reference omitted keys SHOULD be stripped or replaced with neutral placeholders. |
| **No superset leak** | R2 | Decrypting `id`'s block MUST NOT reveal values for keys ∉ `L` via `entries` or `_raw`. |
| **Reconstruct** | R3 | Unlock / Safe Edit MAY prefer filtered `_raw` when present; otherwise synthesize from `entries`. |

Implementations MUST have tests proving Bob's block cannot recover `PROD_DB_URL` from `_raw` when Bob's policy lists only `DB_HOST,API_KEY`.

---

## 6. Decrypt (normative)

Unchanged crypto (X25519 + XChaCha20-Poly1305). After JSON parse:

1. Remove `_raw` from entries map (existing behavior).
2. Return `{ entries, raw }` where `entries` ⊆ policy slice for that block (legacy: full set).

Callers (`unlock`, `run`, Safe Edit) MUST NOT expose keys outside the decrypted payload to disk or env injection.

---

## 7. Verify (`up verify` — recommended command)

Read-only checks without printing values:

| Check | ID | Failure |
|-------|-----|---------|
| Parse `[policy]` | V1 | Invalid grammar / unsupported version |
| P1–P5 | V2 | Policy / catalog / block mismatch |
| Per-block subset | V3 | For each block decryptable with a test key (CI: fixture keys): `keys(decrypted.entries) ⊆ policy[id].keys` |
| Ciphertext-only | V4 | Without private key: structural checks only (P1–P5, block count) |

Exit codes: `0` ok, `1` policy/verify failure, `2` system error (align with CLI conventions).

**Non-interactive:** `--json` emits `{ "ok": true }` or `{ "ok": false, "errors": [{ "code": "P1", "message": "..." }] }` without values.

---

## 8. Merge re-encrypt (normative)

**Inputs:** existing `.env.up` file `F`, editor plaintext map `E_edit` (from unlock / import / Safe Edit), editor identity `who` (recipient id that decrypted), recipient pubkeys `K`.

**Output:** updated `.env.up` `F'`.

### 8.1 Algorithm

```
F' ← copy header, [keys], [policy], [signature] from F (then update [keys] metadata for edited keys)

For each encrypted block B in F.encryptedBlocks:
  if decrypt(B) succeeds with editor's private key:
    E_merged ← mergePolicyAware(
      oldEntries = decrypt(B).entries,
      newEntries = E_edit,
      policySlice = policy[who] or ALL_KEYS
    )
    B' ← encrypt(E_merged, filtered_raw, recipient=B.recipient, keys=policy[B.recipient])
  else:
    B' ← B   // preserve ciphertext editor cannot open

F'.encryptedBlocks ← [ B' for each B ]

Recompute [keys] rows for keys in E_edit (version bump, author, timestamp)
Update Encrypted-By / Created as today
```

### 8.2 `mergePolicyAware`

| Rule | ID | Description |
|------|-----|-------------|
| **Editor slice only** | M1 | Only keys in `policy[who]` (or all keys in legacy mode) may change from `E_edit`. |
| **Preserve others** | M2 | Keys in `oldEntries` not in `E_edit` keep `oldEntries` values. |
| **No catalog drop** | M3 | Keys in `[keys]` but not in editor's slice MUST NOT be removed from `[keys]` or other recipients' blocks. |
| **Other blocks untouched** | M4 | Blocks the editor cannot decrypt are copied byte-identical. |

### 8.3 Failure modes

| Condition | Behavior |
|-----------|----------|
| `E_edit` contains key ∉ `policy[who]` in policy mode | Reject import (exit 1) with clear message |
| `[policy]` missing but multiple recipients | Legacy: full replace for all blocks editor can decrypt (current behavior); document as pre-merge v1 limitation |
| Editor can decrypt multiple blocks (same key) | Use block matching `who` / first successful `decryptAny` recipient id |

---

## 9. `[keys]` catalog updates

Editing a key in `E_edit`:

- Bump version, set `updatedAt`, set author to `who` for that key row.
- Keys not in `E_edit` keep existing `[keys]` rows.

Adding a new key:

- Requires the key appear in `[policy]` for `who` before import (or policy must be updated in same commit).
- Other recipients get the new key only if listed in their policy row on re-encrypt.

Removing a key from catalog:

- Out of scope for automatic merge; human removes from `[keys]` + `[policy]` + re-encrypt all blocks.

---

## 10. Backward compatibility

| Scenario | Reader (old) | Writer (new) |
|----------|--------------|--------------|
| No `[policy]` | Works | Works (legacy encrypt) |
| `[policy]` present, old reader | Ignores `[policy]`; decrypts block (may see full or partial payload depending on writer) | N/A |
| `[policy]` present, new reader | Parses policy; verifies if asked | Filtered encrypt + merge |

Old tools that re-import without merge **can wipe** other recipients' data — documented risk until merge ships ([TEAM_SECRETS_SECURITY.md](./TEAM_SECRETS_SECURITY.md) §4).

---

## 11. Test fixtures (planned)

Normative fixtures for `packages/format/src/__tests__/fixtures/team-secrets/`:

| File | Purpose |
|------|---------|
| `policy-v1-minimal.env.up` | Two recipients, disjoint subsets |
| `policy-v1-overlap.env.up` | Shared + exclusive keys |
| `policy-invalid-p1.env.up` | Key in policy not in catalog (verify fail P1) |
| `policy-invalid-p3.env.up` | Policy row without encrypted block |
| `legacy-no-policy.env.up` | v1 full payload (regression) |

Golden vectors: decrypt with fixture keys → expected key sets only (never commit private keys; generate in test setup).

---

## 12. Related docs

- [TEAM_SECRETS_SOLUTION.md](./TEAM_SECRETS_SOLUTION.md) — product design
- [TEAM_SECRETS_TEST_PLAN.md](./TEAM_SECRETS_TEST_PLAN.md) — test matrix
- [TEAM_SECRETS_SECURITY.md](./TEAM_SECRETS_SECURITY.md) — threat model
- [FORMAT_V2.md](./FORMAT_V2.md) — metadata signatures (orthogonal)
