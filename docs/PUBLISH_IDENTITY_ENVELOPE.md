# Manual publish steps — identity envelope (v0.6.3 / npm 0.1.0)

Already done:

- [x] PR #13 merged to `main`
- [x] Git tag `v0.6.3` + [GitHub Release](https://github.com/sarhej/dotenvup/releases/tag/v0.6.3) with `.vsix`
- [x] VS Code Marketplace **0.6.3** published
- [x] Open VSX **0.6.3** published
- [ ] npm packages (blocked on your OTP / web auth)
- [ ] Website deploy (`docs/` → dotenvup.com) — needs `CLOUDFLARE_API_TOKEN`

## 1. npm (required — OTP)

From repo root on `main`, after `npm whoami` works:

```bash
cd /Users/supersergio/projects/dotenvup
git checkout main && git pull
npm run build

npm publish --workspace=@dotenvup/secret-generator --access public
npm publish --workspace=@dotenvup/format --access public
npm publish --workspace=@dotenvup/node --access public
npm publish --workspace=@dotenvup/cli --access public
npm publish --workspace=@dotenvup/mcp --access public
```

If npm asks for OTP / opens a browser URL, complete it, then re-run the remaining publishes.

With authenticator code:

```bash
npm publish --workspace=@dotenvup/secret-generator --access public --otp=XXXXXX
# …repeat for format, node, cli, mcp
```

Verify:

```bash
npm view @dotenvup/secret-generator version   # 0.1.0
npm view @dotenvup/format version             # 0.1.0
npm view @dotenvup/cli version                # 0.1.0
npm view @dotenvup/mcp version                # 0.1.1
npm i -g @dotenvup/cli@0.1.0
up --version
up status --json
```

## 2. VS Code Marketplace

```bash
cd /Users/supersergio/projects/dotenvup
npm run publish:extension
# or:
cd packages/vscode-dotenvup && npx @vscode/vsce publish --no-dependencies
```

Needs a valid `vsce` login / Personal Access Token for publisher `dotenvup`.

## 3. Open VSX (Cursor)

```bash
npm run publish:openvsx
# or:
cd packages/vscode-dotenvup && npx ovsx publish --no-dependencies
```

Needs `OVSX_PAT` (or `ovsx login`).

## 4. Website (dotenvup.com)

Static site is `docs/` (incl. new identity section). Edge worker:

```bash
cd workers/dotenvup-edge && npm install && npx wrangler deploy
```

Use the Cloudflare account that owns **dotenvup.com**. Confirm `https://dotenvup.com/#identity` shows the “Encrypted local identity + recovery” section (and “not Touch ID yet”).

If the site is GitHub Pages / another host, deploy `docs/` the usual way for this repo.

## Messaging reminder

Lead with **encrypted local identity + recovery**. Do **not** say Touch ID shipped.
