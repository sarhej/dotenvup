# Changelog

## [0.3.0] - 2026-08-25

- Merge `up import` when `.env.up` exists (policy-aware; other recipients' blocks preserved)
- `up verify` / `up reencrypt` (full-catalog gate in policy mode)
- `up recipients remove` updates `[policy]` + encrypted block (atomic write)
- Unlock / run / show refuse ciphertext that exceeds `[policy]`
