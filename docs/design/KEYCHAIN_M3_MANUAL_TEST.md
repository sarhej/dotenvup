# Manual test checklist — Keychain (M2) + Session agent (M3)

Run on a Mac with Touch ID (or password fallback). Use the **local linked CLI** (`npm link` from `packages/cli`) so you have M2/M3 commands.

Prerequisites:

```bash
cd /path/to/dotenvup
npm run build --workspace=@dotenvup/keychain --workspace=@dotenvup/format --workspace=@dotenvup/cli
# helper should be Developer ID signed when possible (auto if cert present)
up --version
up status --json   # expect keyStorage keychain or file-envelope
```

If still on file envelope: `up key migrate-to-keychain` (approve Touch ID on verify).

---

## Checklist

### 1. Cold → warm (Touch ID once)

- [ ] `up session stop` (ignore “No active session”)
- [ ] `up session status` → inactive
- [ ] `up run -- true` → **Touch ID / password prompts** → exit 0
- [ ] `up session status` → active, Key-Id matches `up status --json` `.keyId`
- [ ] `up status --json` → `"sessionActive": true`

### 2. Warm: no second prompt

- [ ] Immediately: `up run -- true` → **no** biometric prompt → exit 0
- [ ] `up keys` or `up show` (if used) → no prompt while warm  
  (Avoid pasting `up show` output into chat.)

### 3. Screen lock wipes session

- [ ] With session active, **lock the screen** (Ctrl-Cmd-Q), unlock Mac
- [ ] `up session status` → inactive (or next step prompts)
- [ ] `up run -- true` → **prompts again** → exit 0

### 4. Non-interactive contract

With session **warm**:

```bash
DOTENVUP_NO_PROMPT=1 up run -- true
```

- [ ] Exit 0 (uses warm session)

Then:

```bash
up session stop
DOTENVUP_NO_PROMPT=1 up run -- true
```

- [ ] Exit **1**, message about session locked / no hang

### 5. Cancel biometric

- [ ] `up session stop`
- [ ] `up run -- true` → when prompted, **Cancel**
- [ ] Exit 1, “Authentication cancelled” (or equivalent)
- [ ] `up status --json` → still `"keyStorage":"keychain"` (no silent downgrade)

### 6. Cursor / Electron

- [ ] In **Cursor** integrated terminal (not only Terminal.app):  
  `up session stop && up run -- true` → system auth dialog appears and works
- [ ] Second `up run -- true` in Cursor → no prompt while warm

### 6b. Safe Edit (extension must include Keychain build)

Marketplace **0.6.3** does **not** understand Keychain-backed identity. Use a local build:

```bash
npm run build --workspace=@dotenvup/keychain --workspace=@dotenvup/format --workspace=dotenvup
# Install from VSIX or F5 Extension Development Host, then Reload Window
```

- [ ] Cold session: Safe Edit → Touch ID / password → editor opens  
- [ ] Or: `up run -- true` (warm) then Safe Edit → no prompt  
- [ ] Cancel Touch ID → clear error (not a cryptic `CodeExpectedError`)

### 7. Sleep (optional but valuable)

- [ ] Warm session → put Mac to sleep → wake  
- [ ] `up session status` inactive **or** next `up run` prompts

### 8. Recovery still works (smoke)

- [ ] `up key recovery status` → recovery present for Key-Id  
- [ ] Do **not** delete Keychain item in day-to-day use; if testing wipe:  
  restore with `up key import ~/.dotenvup/recovery/<keyId>.dotenvup-key` + code

---

## Pass criteria

All of 1–6 pass. 7–8 recommended before calling M3 “production ready” for marketing.

## Automations that already cover parts of this

See format tests:

- `sessionAgent.test.ts` / `sessionAgent.edge.test.ts`
- `keychainEnvelope.test.ts` / `keychainSession.integration.test.ts`

CI runs these on Ubuntu + macOS (`npm test`). Interactive Touch ID / lock screen remain **manual only**.
