# DotEnvUp Test Suite

Tests are colocated with source code in each package:

| Package | Test location | Run |
|---------|---------------|-----|
| **@dotenvup/cli** | `packages/cli/src/__tests__/` | `npm test --workspace=@dotenvup/cli` |
| **@dotenvup/format** | `packages/format/src/__tests__/` | `npm test --workspace=@dotenvup/format` |
| **vscode-dotenvup** | `packages/vscode-dotenvup/src/test/` | `npm test --workspace=dotenvup` |

## Run all tests

```bash
npm test
```

## Run from repo root

```bash
npm run build && npm test
```

## Test files

- `packages/cli/src/__tests__/commands.test.ts` — happy path: init, import, lock, unlock, show, status
- `packages/cli/src/__tests__/edge-cases.test.ts` — Key-Id mismatch, duration formats, invalid input, monorepo
- `packages/format/src/__tests__/` — parser, serializer, crypto (roundtrip, keyFingerprint, keyId)
