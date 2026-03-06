# Publishing the DotEnvUp Extension to the Marketplace

This guide walks through getting the DotEnvUp extension onto the [VS Code Marketplace](https://marketplace.visualstudio.com/) (and thus installable via **Extensions** in VS Code/Cursor).

Before publishing, follow the release gate in [RELEASE.md](RELEASE.md).

## Prerequisites

- Node.js 20+
- A **Microsoft account**
- The repo built and tests passing: `npm run build && npm run test`

## 1. Create a publisher (one-time)

The extension `package.json` uses **publisher ID: `dotenvup`**. You must create that publisher in the Marketplace.

1. **Get a Personal Access Token (PAT)**
   - Go to [Azure DevOps](https://dev.azure.com/) and sign in with your Microsoft account.
   - If you don’t have an organization, create one (free).
   - Open **User settings** (top right) → **Personal access tokens** → **New Token**.
   - Name it (e.g. “VS Code Marketplace”).
   - Under **Scopes**, choose **Custom defined**, then enable **Marketplace** → **Manage**.
   - Create the token and **copy it** (it’s shown only once).

2. **Create the publisher**
   - Go to [Marketplace publisher management](https://marketplace.visualstudio.com/manage).
   - Sign in with the same Microsoft account.
   - Click **Create publisher**.
   - **ID:** `dotenvup` (must match `publisher` in `package.json`).
   - **Name:** e.g. “DotEnvUp” or your name/org.
   - Create and save.

3. **Log in with vsce (one-time per machine)**

   ```bash
   npm install -g @vscode/vsce
   vsce login dotenvup
   ```

   When prompted, paste the PAT. You can reuse the same token for future publishes.

## 2. Package and publish

From the repo root:

```bash
# Build everything (format, then extension)
npm run build --workspace=@dotenvup/format
npm run build --workspace=dotenvup

# Optional: create .vsix locally to test
cd packages/vscode-dotenvup && npx @vscode/vsce package --no-dependencies && cd ../..

# Publish to the Marketplace
cd packages/vscode-dotenvup
vsce publish
```

- **First publish:** `vsce publish` uploads the current version from `package.json`.
- **Preferred workflow:** bump the version and changelog yourself first, then run `vsce publish`.

After a few minutes the extension will appear at:
`https://marketplace.visualstudio.com/items?itemName=dotenvup.dotenvup`

## 3. Publish to Open VSX (Cursor, Antigravity, VSCodium, and other VS Code–based IDEs)

**Many VS Code–based editors use the [Open VSX](https://open-vsx.org/) registry instead of the Microsoft Marketplace.** That includes:

- **Cursor** — extension search uses Open VSX
- **Antigravity** (Google / Antigravity AI) — defaults to Open VSX
- **VSCodium** — defaults to Open VSX
- **Windsurf**, **Eclipse Theia**, and other forks

So if your extension is only on the VS Code Marketplace, it **won’t show up** in Cursor, Antigravity, or VSCodium by default. Publish the same `.vsix` to Open VSX once, and it will be available in all of them.

*(Users can still install from a `.vsix` file or point their IDE at the VS Code Marketplace via settings, but publishing to Open VSX is the way to appear in the built-in extension search for these editors.)*

### One-time setup

1. **Create an Eclipse account** (required to sign the Publisher Agreement)  
   [Register at Eclipse](https://accounts.eclipse.org/user/register). Fill in the **GitHub username** and use the same GitHub account you’ll use for open-vsx.org.

2. **Log in and sign the Publisher Agreement**  
   - Log in at [open-vsx.org](https://open-vsx.org/) (Sign in with GitHub).  
   - Go to **Profile** (avatar → Settings).  
   - Click **Log in with Eclipse** and authorize with your Eclipse account.  
   - Click **Show Publisher Agreement**, read it, and click **Agree**.

3. **Create the namespace**  
   Your `package.json` has `"publisher": "dotenvup"`. Create that namespace once (replace `<token>` with your Open VSX access token from step 4):
   ```bash
   npx ovsx create-namespace dotenvup -p <token>
   ```

4. **Create an access token**  
   On [open-vsx.org](https://open-vsx.org/) go to **Settings → Access Tokens**. Click **Generate New Token**, name it (e.g. “DotEnvUp publish”), and **copy the token** (it’s shown only once).

### Publish

From the repo root, build and package the extension, then publish the `.vsix` to Open VSX:

```bash
npm run package:extension
npx ovsx publish packages/vscode-dotenvup/dotenvup-X.Y.Z.vsix -p <your-open-vsx-token>
```

Use the actual `.vsix` filename for the version you just packaged. After a short delay, the extension will appear at [open-vsx.org/extension/dotenvup/dotenvup](https://open-vsx.org/extension/dotenvup/dotenvup) and in **Cursor**, **Antigravity**, **VSCodium**, **Windsurf**, and other Open VSX-based editors.

**Optional (verified publisher):** To get a “verified” badge on Open VSX, [claim ownership of the namespace](https://github.com/eclipse/openvsx/wiki/Namespace-Access) (e.g. link the namespace to your GitHub org/repo).

## 4. Optional: extension icon (PNG)

The Marketplace does **not** accept SVG for the extension’s main icon. For a 128×128 or 256×256 PNG:

1. Add a file, e.g. `packages/vscode-dotenvup/icon.png` (e.g. export from `docs/assets/logo-dark.svg` at 128×128).
2. In `packages/vscode-dotenvup/package.json` add: `"icon": "icon.png"`.
3. Repackage and publish.

If `icon` is omitted, the Marketplace uses a default placeholder.

## 5. CI (optional): publish on release

To publish automatically when you create a GitHub Release:

1. Add a **secret** in the repo: `VSCE_PAT` = your Azure DevOps PAT (Marketplace → Manage scope).
2. In `.github/workflows/extension.yml`, add a job that runs after `package-on-release`:
   - Install vsce, run `vsce publish --pat ${{ secrets.VSCE_PAT }}` from `packages/vscode-dotenvup` (only when a release is published and you’re happy to ship that version).

The existing workflow already builds and attaches the `.vsix` to the release; the extra step would upload that same version to the Marketplace.

## 6. Checklist before first publish

- [ ] Publisher `dotenvup` created and `vsce login dotenvup` done.
- [ ] `package.json`: `name`, `version`, `publisher`, `displayName`, `description`, `license`, `engines` are set.
- [ ] `README.md` and `CHANGELOG.md` exist in `packages/vscode-dotenvup/` (no user-provided SVGs in those files; use HTTPS for images).
- [ ] `npm run build` and `npm run test` pass.
- [ ] Optional: 128×128 or 256×256 PNG `icon` in `package.json` for the Marketplace listing.

## References

- [Publishing Extensions (VS Code)](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Publishing to Open VSX](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions) — required for Cursor
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [vsce CLI](https://github.com/microsoft/vscode-vsce)
- [ovsx CLI](https://www.npmjs.com/package/ovsx) — `npx ovsx publish`
