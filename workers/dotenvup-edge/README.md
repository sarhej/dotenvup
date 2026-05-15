# dotenvup-edge (Cloudflare Worker)

Optional edge layer for [dotenvup.com](https://dotenvup.com/) when DNS is proxied through Cloudflare.

## What it does

- **RFC 8288 `Link` headers** on the HTML homepage (`/` and `/index.html`).
- **Markdown for agents**: `GET /` with `Accept: text/markdown` returns `docs/markdown.md` with `Content-Type: text/markdown` and `x-markdown-tokens` (rough estimate).
- **RFC 9727**: sets `Content-Type` for `/.well-known/api-catalog` to `application/linkset+json` (with profile).
- **OAuth / OIDC discovery**: `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` are proxied from [UnknownPassword](https://unknownpassword.com/) (real issuer for the related product). DotEnvUp’s static site does not run its own IdP.
- **Origin**: files are read from `https://raw.githubusercontent.com/sarhej/dotenvup/<GITHUB_REF>/docs/...` so we avoid GitHub Pages redirect loops to the custom domain.

## Deploy

```bash
cd workers/dotenvup-edge
npm install
npx wrangler login   # if needed
npx wrangler deploy
```

Attach a route **`dotenvup.com/*`** (or `www.dotenvup.com/*`) to this Worker on the zone that fronts the site. If `wrangler.toml` routes are commented out, add the route in the Cloudflare dashboard: **Workers & Pages → dotenvup-edge → Triggers → Routes**.

Optional: set **`GITHUB_REF`** in `[vars]` or as a Worker secret if you need a branch other than `main`.

## Without this Worker

GitHub Pages continues to serve `docs/` directly. The Worker is only active when you route the hostname to it.

## Cloudflare “Markdown for Agents”

If you enable Cloudflare’s built-in [Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/) on the same zone, avoid stacking it with this Worker’s `/` markdown handling for the same URL—pick one approach so behavior stays predictable.
