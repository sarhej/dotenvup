# Team secrets — test plan (pre-implementation gate)

> **Status:** Test specification — **no feature code until this gate passes.**  
> **Contracts:** [TEAM_SECRETS_SPEC_ADDENDUM.md](./TEAM_SECRETS_SPEC_ADDENDUM.md)  
> **Design:** [TEAM_SECRETS_SOLUTION.md](./TEAM_SECRETS_SOLUTION.md)

---

## 1. Definition of done (feature ship)

All must be true before merging implementation to `main`:

- [ ] Every **normative rule** in the spec addendum (P1–P5, R1–R3, M1–M4, V1–V4) has at least one automated test.
- [ ] `npm test` green (format, cli, extension suites).
- [ ] Extended QA harness green (`qa-fake-project.sh` + `qa-fake-project-policy.sh`).
- [ ] Security checklist in [TEAM_SECRETS_SECURITY.md](./TEAM_SECRETS_SECURITY.md) §7 signed off.
- [ ] No test logs or fixtures contain real secrets (generated keys only).
- [ ] Docs: USER_GUIDE team section updated for `[policy]` + merge behavior.

---

## 2. Test pyramid

```
                    ┌─────────────────────┐
                    │  qa-fake-project-*  │  E2E multi-user shell harness
                    └──────────┬──────────┘
               ┌───────────────┴───────────────┐
               │  CLI + extension integration  │  import / unlock / lock / Safe Edit
               └───────────────┬───────────────┘
          ┌────────────────────┴────────────────────┐
          │  @dotenvup/format unit + fixture vectors │
          └─────────────────────────────────────────┘
```

---

## 3. `@dotenvup/format` — unit tests

**New file:** `packages/format/src/__tests__/policy.test.ts`  
**New file:** `packages/format/src/__tests__/mergeReencrypt.test.ts`  
**Extend:** `parser.test.ts`, `serializer.test.ts`, `crypto.test.ts`

### 3.1 Parser / serializer (`[policy]`)

| ID | Case | Assert |
|----|------|--------|
| PAR-01 | Parse valid `[policy]` v1 | `file.policy.version === 1`, rows match |
| PAR-02 | Round-trip serialize | Bytes-stable aside from intentional normalization |
| PAR-03 | Unknown section `[foo]` | Ignored (forward compat) |
| PAR-04 | Malformed row (no `keys:`) | Parse error or skip with warning (document choice) |
| PAR-05 | `version: 99` | Reject on write; read warns |
| PAR-06 | Duplicate recipient id in policy | Reject |
| PAR-07 | File with only `[policy]`, no `[encrypted]` | Parse ok; verify fails P3 |

### 3.2 Policy validation (P1–P5)

| ID | Case | Assert |
|----|------|--------|
| VAL-01 | Key in policy not in `[keys]` | Error P1 |
| VAL-02 | Encrypted block without policy row | Error P3 |
| VAL-03 | Policy row without encrypted block | Error P3 |
| VAL-04 | `Encrypted-For` mismatch | Error/warn P4 (match CLI default) |
| VAL-05 | Valid minimal file | `validatePolicy(file) === ok` |

### 3.3 Encrypt / decrypt (policy mode)

| ID | Case | Assert |
|----|------|--------|
| ENC-01 | Two recipients, disjoint key sets | Bob decrypt ⊄ Alice-only keys |
| ENC-02 | Overlapping keys | Shared values equal across blocks |
| ENC-03 | Single recipient + policy | Same as legacy subset |
| ENC-04 | Legacy (no policy) | Unchanged from current `crypto.test.ts` |
| ENC-05 | **R1/R2** `_raw` filtered | Bob `_raw` has no line for Alice-only key |
| ENC-06 | Import path without `raw` | Entries only; no `_raw` in payload |
| ENC-07 | Wrong private key | Decrypt throws (regression) |

### 3.4 Merge re-encrypt (M1–M4)

| ID | Case | Assert |
|----|------|--------|
| MRG-01 | Bob edits 2 of 8 keys | Bob block updated; Alice block **byte-identical** |
| MRG-02 | Bob import without Alice key in `.env` | Alice-only keys remain in file + Alice block |
| MRG-03 | Bob adds key not in his policy | Import rejected (M1) |
| MRG-04 | Alice edits her exclusive key | Bob block unchanged; Bob slice unchanged |
| MRG-05 | Legacy multi-recipient import (no policy) | Document current behavior OR reject until merge (product choice — test locks decision) |
| MRG-06 | Revoked recipient | Block removed when policy row removed + re-encrypt |
| MRG-07 | New recipient added to policy | New block created; old blocks preserved |

### 3.5 `up verify` logic (library API)

Test the pure function behind verify (CLI thin wrapper):

| ID | Case | Assert |
|----|------|--------|
| VER-01 | Valid policy file | `{ ok: true }` |
| VER-02 | P1 violation fixture | `{ ok: false, errors: [{ code: 'P1' }] }` |
| VER-03 | Decrypted superset vs policy | V3 fail |
| VER-04 | `--json` shape | No values in output (grep test) |

---

## 4. `@dotenvup/cli` — integration tests

**Extend:** `packages/cli/src/__tests__/` (or add if missing import tests)

| ID | Case | Steps | Assert |
|----|------|-------|--------|
| CLI-01 | `up verify` on valid fixture | verify | exit 0 |
| CLI-02 | `up verify` on invalid P1 | verify | exit 1, no stdout secrets |
| CLI-03 | Bob `up unlock` | policy fixture | `.env` keys ⊆ Bob policy |
| CLI-04 | Bob `up run -- printenv` | inject | only Bob keys in child env |
| CLI-05 | Bob `up import` merge | unlock → edit subset → import | Alice keys preserved (MRG-01) |
| CLI-06 | `up keys` | any | full catalog names (metadata) |
| CLI-07 | Import rejects foreign key | Bob adds `JWT_SECRET` | exit 1 |

Use `DOTENVUP_TEST=1` + isolated identity dirs (same pattern as `qa-fake-project.sh`).

---

## 5. VS Code extension

| ID | Case | Assert |
|----|------|--------|
| EXT-01 | Safe Edit open (policy) | Editor shows only decrypted slice |
| EXT-02 | Safe Edit save | Merge path; other blocks preserved |
| EXT-03 | Lock drift (Bob) | Only Bob's keys compared |
| EXT-04 | Re-encrypt command | Same as CLI merge |

Reuse `lockDrift.test.ts` patterns; add policy fixture `.env.up` in test resources.

---

## 6. QA shell harnesses

### 6.1 Existing: `qa-fake-project.sh`

Keep as **legacy regression** (no `[policy]`, full payload both users). Must stay green.

### 6.2 New: `qa-fake-project-policy.sh`

Scripted flow (isolated identities under `.qa-fake-project-policy/`):

| Step | Actor | Action |
|------|-------|--------|
| 1 | Alice | Create `.env` with 4 keys (2 Alice-only, 2 shared) |
| 2 | Alice | Write `[policy]` + import with Bob + CI recipients |
| 3 | Bob | `up unlock` → assert 2 keys only |
| 4 | Bob | Edit 1 shared key → import |
| 5 | Alice | Unlock → assert Alice-only keys unchanged + shared key updated |
| 6 | CI | `up run --` → assert 1 key |
| 7 | Charlie | `up verify` (no key) → structural ok |
| 8 | — | `up verify` after manual P1 break → fail |

Document in [QA_FAKE_PROJECT.md](../QA_FAKE_PROJECT.md).

---

## 7. Regression matrix (must not break)

| Area | Existing tests |
|------|----------------|
| Solo encrypt/decrypt | `crypto.test.ts` |
| Multi-recipient same payload | `crypto.test.ts`, `qa-fake-project.sh` |
| Parser unknown sections | `parser.test.ts` |
| Recipients config | `recipientsConfig.test.ts` |
| Sealed share (orthogonal) | `sealedShare.test.ts` |
| Safe delete | `safeDelete.test.ts` |
| Session / keychain | unchanged |

---

## 8. CI gates

| Gate | Command |
|------|---------|
| Unit + integration | `npm test` |
| Release verify | `npm run release:verify` (before npm publish) |
| QA (optional CI job) | `bash qa-fake-project.sh && bash qa-fake-project-policy.sh` |
| Secret leak scan | Tests must not `console.log` entries; review CI output |

---

## 9. Implementation order (TDD)

1. **Parser + types** for `[policy]` → PAR-* tests first.
2. **validatePolicy** → VAL-* .
3. **encrypt with policy** → ENC-* (including R1/R2 before merge).
4. **mergeReencrypt** pure function → MRG-* .
5. **CLI import** wiring → CLI-* .
6. **`up verify`** → VER-* + CLI-01/02.
7. **Extension** → EXT-* .
8. **QA script** last.

---

## 10. Related docs

- [TEAM_SECRETS_SPEC_ADDENDUM.md](./TEAM_SECRETS_SPEC_ADDENDUM.md)
- [TEAM_SECRETS_SECURITY.md](./TEAM_SECRETS_SECURITY.md)
- [QA_FAKE_PROJECT.md](../QA_FAKE_PROJECT.md)
