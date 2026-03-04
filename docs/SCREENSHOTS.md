# Screenshots and images for dotenvup.com

## Social share image (SEO) — `og-image.png`

**Used for:** Open Graph and Twitter Card previews when the site is shared (e.g. Slack, Twitter, LinkedIn).

- **File:** `docs/assets/og-image.png` — **present** (in repo).
- **Recommended size:** 1200×630 px for og:image / summary_large_image.
- **Content:** Logo + tagline; dark theme and primary color to match the site.

See `docs/SEO_LLM_AUDIT.md` for the full SEO checklist.

---

## Editor screenshots (homepage)

The homepage has placeholders for editor screenshots. Add the images to `docs/assets/` and they will appear in the "See it in your editor" section.

## 1. Status bar — `hero-status-bar.png`

**What to capture:** VS Code or Cursor with a project that has `.env.up`. The status bar should show the DotEnvUp item (e.g. "All protected" or "Unlock" / "Lock").

**Tips:**
- Crop to the status bar area (bottom of the window) so it’s clear at a glance.
- Use a window width of about 1200–1400px so the status bar is readable.
- Dark theme matches the site.

**Suggested size:** ~800×200 px or similar aspect ratio (wide strip).

## 2. Safe Edit — `hero-safe-edit.png`

**What to capture:** Editor with an `.env.up` file open in Safe Edit (virtual doc): the tab shows decrypted key=value content (e.g. `API_KEY=sk-...`, `DB_URL=...`), not the raw encrypted format.

**Tips:**
- Show the tab title (e.g. `.env.up`) and a few lines of plaintext keys/values.
- Optionally show the explorer with `.env.up` and the right-click "Edit with DotEnvUp" context.
- Dark theme.

**Suggested size:** ~800×350 px or similar (editor content visible).

---

After adding the files:

- `docs/assets/hero-status-bar.png`
- `docs/assets/hero-safe-edit.png`

replace the placeholder divs in `docs/index.html` with:

```html
<img src="/assets/hero-status-bar.png" alt="Status bar showing DotEnvUp lock state" style="width: 100%; height: 100%; object-fit: cover; display: block;">
```

(and the same for `hero-safe-edit.png`) so the screenshots display instead of the placeholder text.
