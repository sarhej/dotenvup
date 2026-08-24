# Team secrets — security review (pre-implementation)

> **Status:** Threat model and acceptance gate for `[policy]` + merge re-encrypt.  
> **Design:** [TEAM_SECRETS_SOLUTION.md](./TEAM_SECRETS_SOLUTION.md) · **Normative rules:** [TEAM_SECRETS_SPEC_ADDENDUM.md](./TEAM_SECRETS_SPEC_ADDENDUM.md)  
> **Base model:** [SECURITY.md](../SECURITY.md)

---

## 1. Scope

This review covers:

- Optional cleartext `[policy]` (value ACL by key name)
- Per-recipient filtered ciphertext
- Merge re-encrypt on import / Safe Edit / lock
- `up verify` (structural + optional decrypt checks)

Out of scope here: FORMAT v2 metadata signatures ([FORMAT_V2.md](./FORMAT_V2.md)), UnknownPassword product security, sealed one-off shares.

---

## 2. Assets and trust boundaries

| Asset | Location | Who can see it |
|-------|----------|----------------|
| Key **names** (catalog) | Cleartext `[keys]` + header | Anyone with repo read |
| Key **policy** (who gets which names) | Cleartext `[policy]` | Anyone with repo read |
| Secret **values** | `[encrypted]` only | Holders of matching private key + policy slice |
| Private keys | `~/.dotenvup/` (local) | Device user / CI with `UP_KEY` |
| Plaintext `.env` | Disk when unlocked | Device user, backups, indexers |

**Trust boundary:** DotEnvUp does not enforce roles. **Git** is the audit trail. If you can decrypt, you can edit and re-encrypt for the same recipient set.

---

## 3. Security goals

| Goal | Mechanism |
|------|-----------|
| **Confidentiality (values)** | Per-recipient AEAD; filtered JSON payload |
| **No cross-recipient value leak** | Policy encrypt + filtered `_raw` (R1, R2) |
| **No accidental wipe** | Merge re-encrypt (M1–M4) |
| **Integrity (policy vs ciphertext)** | `up verify` V3; optional v2 signatures later |
| **Backward compat** | Ignore unknown sections; legacy mode unchanged |

**Non-goals:** Hiding key names from repo readers; preventing a decryptor from exfiltrating values they can read; server-side ACL enforcement without UP.

---

## 4. Threat scenarios

### 4.1 Accidental data loss (merge wipe) — **High (today)**

| | |
|---|---|
| **Scenario** | Bob unlocks, edits 2 keys, `up import` re-encrypts **full** file for all recipients with only Bob's plaintext → Alice-only secrets lost. |
| **Current v1** | **Vulnerable** — `import.ts` calls `create()` with full replace. |
| **Target** | Merge algorithm §8 of spec addendum; MRG-* tests. |
| **Residual** | Malicious Bob could still delete keys from **his** slice; cannot delete Alice-only ciphertext without Alice's cooperation unless he edits `[policy]` in git (visible). |

### 4.2 `_raw` superset leak — **Critical (if mishandled)**

| | |
|---|---|
| **Scenario** | Entries filtered for Bob but `_raw` still contains full `.env` with `PROD_DB_URL=…`. |
| **Impact** | Bob reads production URL despite policy. |
| **Mitigation** | R1/R2 normative; ENC-05 tests mandatory before ship. |
| **Residual** | Comments in shared lines might hint context; values must not appear. |

### 4.3 Cleartext policy tampering — **Medium**

| | |
|---|---|
| **Scenario** | Attacker commits `[policy]` granting `@eve` `API_KEY` without re-encrypting for Eve. |
| **Impact** | Eve still cannot decrypt without block + key; **misleading audit** in git. |
| **Mitigation** | `up verify` P3; code review; optional FORMAT v2 signature over `[keys]+[policy]`. |
| **Residual** | Repo write access can always lie in cleartext until signatures ship. |

### 4.4 Ciphertext/policy mismatch — **Medium**

| | |
|---|---|
| **Scenario** | Policy says Bob gets 2 keys; blob actually contains 40 (bug or malicious writer). |
| **Impact** | Over-permission until detected. |
| **Mitigation** | V3 verify with decrypt; writers must use policy-aware `encrypt()`. |
| **Residual** | Offline verify without private key cannot detect V3. |

### 4.5 Metadata intelligence — **Accepted**

| | |
|---|---|
| **Scenario** | Intern sees `PROD_DB_URL`, `STRIPE_SECRET` in `[keys]` without values. |
| **Decision** | **By design** (half-open envelope). Mitigate with separate repos or UP org boundaries if needed. |

### 4.6 Revocation — **Low**

| | |
|---|---|
| **Scenario** | Remove Bob from `[policy]` and re-encrypt without his block. |
| **Impact** | Old commits still contain Bob's historical ciphertext (git history). |
| **Mitigation** | Document key rotation + `JWT_SECRET` style rotation; not a format bug. |

### 4.7 Insider decryptor exfiltration — **Accepted**

| | |
|---|---|
| **Scenario** | Bob decrypts his slice and posts values in Slack. |
| **Mitigation** | Organizational; not cryptographically preventable. |

### 4.8 UnknownPassword control plane — **Low (OSS path)**

| | |
|---|---|
| **Scenario** | UP compromised; attacker swaps pub keys in directory. |
| **Impact** | Re-encrypt to attacker key if user trusts UP without confirming fingerprint. |
| **Mitigation** | OSS path: manual `.pub` / `up recipients add`; fingerprint display (existing). See [UNKNOWNPASSWORD_BOUNDARY.md](./UNKNOWNPASSWORD_BOUNDARY.md). |

---

## 5. STRIDE summary

| Threat | Applicable? | Notes |
|--------|-------------|-------|
| **S**poofing | Low | No sender auth in recipient blocks; git identity for commits |
| **T**ampering | Medium | Cleartext policy; mitigated by verify + future v2 signature |
| **R**epudiation | Low | Git log; no built-in signed audit log |
| **I**nformation disclosure | High if merge/`_raw` wrong | Core implementation risk |
| **D**enial of service | Low | Corrupt file → decrypt fail; recover flows exist |
| **E**levation | Medium | Policy mode must reject editing keys outside slice |

---

## 6. Safe defaults (implementation requirements)

1. **Policy mode off** unless `[policy]` section exists (no silent behavior change for solo devs).
2. **Import with policy** MUST use merge, never full replace.
3. **Unlock / run** MUST inject only decrypted entries (already true; add policy tests).
4. **`up verify`** MUST NOT print values (metadata errors only).
5. **Debug logs** MUST NOT include filtered or full entries (`UP_DEBUG` rules unchanged).
6. **Agents** — `up keys` shows names; agents must not assume value access ([AGENTS.md](../../AGENTS.md)).

---

## 7. Pre-ship security checklist

Sign off before merging feature PR:

- [ ] ENC-05 / R2: `_raw` leakage tests pass
- [ ] MRG-01/02: merge preserves other recipients' ciphertext
- [ ] CLI-07: cannot import keys outside policy slice
- [ ] No `up show` / verify / test dumps values in CI logs
- [ ] SECURITY.md updated (pointer + half-open policy note)
- [ ] Threat §4.1 documented in USER_GUIDE ("use new CLI for team policy files")
- [ ] Optional: semgrep / manual review of `encrypt(` call sites for policy path

---

## 8. Residual risk acceptance

| Risk | Accepted by |
|------|-------------|
| Cleartext key names in git | Product design |
| Git history retains old ciphertext | Standard secret rotation practice |
| Decryptor can copy values | Organizational policy |
| Policy lies without re-encrypt | Verify + review; v2 signatures later |

---

## 9. Related docs

- [TEAM_SECRETS_SOLUTION.md](./TEAM_SECRETS_SOLUTION.md)
- [TEAM_SECRETS_TEST_PLAN.md](./TEAM_SECRETS_TEST_PLAN.md)
- [TEAM_SECRETS_SPEC_ADDENDUM.md](./TEAM_SECRETS_SPEC_ADDENDUM.md)
- [SECURITY.md](../SECURITY.md)
