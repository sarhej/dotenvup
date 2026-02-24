# DotEnvUp Extension — .env Deletion Safety Audit

**Purpose:** Ensure we never delete or overwrite `.env` in a way that loses user data. Every code path that can remove or overwrite `.env` must be documented and guarded.

**Last audit:** 2026-02-24 (after drift UX fix and auto-lock/deactivate hardening).

---

## Invariant

**We must NEVER delete `.env` when it contains changes not reflected in `.env.up`** (drift). Deleting in that case would lose data the user explicitly saved.

---

## All code paths that can delete or overwrite `.env`

### 1. Manual Lock (Lock command / status bar → Lock)

| Step | Guard |
|------|--------|
| User runs Lock | — |
| Read `.env` and `.env.up`, decrypt, compare | — |
| **If drift** | Show dialog: **only** "Save to .env.up & Lock" or "Cancel". No "discard" option. If user chooses Save & Lock → run Import (writes .env → .env.up), then Lock again. If Cancel → return, `.env` untouched. |
| **If no drift** | Optional confirm dialog ("About to delete .env. Proceed?"), then continue. |
| **TOCTOU recheck** | Re-read `.env`; if content changed since first read → abort with "File changed during lock. Run lock again." (covers user saving after we read). |
| **Final gate** | `isSafeToDelete(.env.up)` — must be decryptable. |
| **Delete** | `fs.unlink(envPath)` only after all checks. |

**Result:** Saved file with new lines is never deleted unless user explicitly chose "Save to .env.up & Lock" (import runs first) or had no drift.

---

### 2. Timer auto-lock (Unlock with duration → timer fires)

| Step | Guard |
|------|--------|
| Timer fires | — |
| `isSafeToDelete(.env.up)` | Must pass (decryptable). |
| **Drift check** | `envHasDrift(envPath, envUpPath, privKey)`. **If true → skip delete**, log: "Auto-lock skipped — .env has changes not saved to .env.up." |
| **Delete** | `fs.unlink(envPath)` only when no drift. |

**Result:** If user saved new lines to `.env` and did not Import, auto-lock never deletes `.env`.

---

### 3. Deactivate (VS Code / Cursor close)

| Step | Guard |
|------|--------|
| Extension deactivate runs | — |
| For each unlocked root with `.env` | — |
| `isSafeToDelete(.env.up)` | Must pass. |
| **Drift check** | `envHasDrift(envPath, envUpPath, privateKey)`. **If true → skip delete**, log: "Left .env in place on close." |
| **Delete** | `fs.unlink(envPath)` only when no drift. |

**Result:** Closing the editor never deletes `.env` when it has unsaved-to-.env.up changes.

---

### 4. Re-encrypt and Lock (Lock when .env.up cannot be decrypted)

| Step | Guard |
|------|--------|
| User runs Lock, decrypt of `.env.up` fails | Dialog: "Re-encrypt .env with your current key?" |
| User chooses "Re-encrypt and Lock" | Run **Import** (reads `.env`, writes `.env.up`). |
| Import success | Verify `isSafeToDelete` on new `.env.up`. |
| **Delete** | `fs.unlink(envPath)` only after Import succeeded and verification passed. |

**Result:** `.env` is only removed after its content has been written to `.env.up`.

---

### 5. First-time Protect (no .env.up → one-click Protect)

| Step | Guard |
|------|--------|
| User clicks status bar, no .env.up, has .env | Init/keypair flow if needed, then for each file: Import then Lock. |
| **Import** | Writes `.env` → `.env.up`. |
| **Verify** | Decrypt `.env.up`; if verification fails → "Your .env was NOT deleted.", do not call Lock. |
| **Lock** | Normal lock flow (drift check; here no drift since we just wrote .up from .env). |

**Result:** Delete only after Import and verification.

---

### 6. Import All → Lock (delete sources)

| Step | Guard |
|------|--------|
| User chooses "Lock (delete sources)" | For each file: `lockCmd.run(..., { envPath: srcPath, envUpPath: outPath, skipConfirm: true })`. |
| Inside Lock | **Drift check**: if `.env` was edited after import → show "Save them and lock?" dialog. **No drift** → TOCTOU recheck, then delete. |

**Result:** Delete only when content matches `.env.up` or user explicitly chooses Save & Lock after drift.

---

### 7. Import (single file) → "Delete source"

| Step | Guard |
|------|--------|
| User clicks "Delete source" | Content was already written to `.env.up` and verified with `isSafeToDelete`. |

**Result:** Intentional delete after content is in `.env.up`.

---

### 8. Unlock (overwrite .env)

| Step | Guard |
|------|--------|
| `.env` exists and differs from `.env.up` | Dialog: "Unlock will overwrite. Proceed?" — overwrite only if user chooses "Overwrite". |

**Result:** Overwrite only with explicit user consent when drift exists.

---

## Summary

| Scenario | Drift / data-loss guard |
|----------|--------------------------|
| Manual Lock, drift | No discard; only "Save to .env.up & Lock" or Cancel; TOCTOU recheck before delete |
| Timer auto-lock | `envHasDrift` → skip delete |
| Deactivate | `envHasDrift` → skip delete |
| Re-encrypt and Lock | Import first, then delete |
| First-time Protect | Verify after Import; Lock has drift check |
| Import All + Lock | Lock command drift check (and TOCTOU) |
| Import + Delete source | Content already in .env.up |
| Unlock overwrite | User must confirm Overwrite |

---

## Key implementation details

- **`envHasDrift(envPath, envUpPath, privateKey)`** (`lock.ts`): used by timer auto-lock and deactivate. If true, callers must **not** delete `.env`.
- **Lock with drift:** Only "Save to .env.up & Lock" and "Cancel"; choosing Save & Lock runs Import then Lock (no silent discard).
- **TOCTOU in Lock:** Re-read `.env` immediately before delete; if changed since first read, abort with "File changed during lock. Run lock again."
