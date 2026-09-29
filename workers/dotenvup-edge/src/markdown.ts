/**
 * Small GitHub-flavoured subset for publishing docs/SECURITY.md at /security.
 * Source of truth remains the markdown file. Do not duplicate the threat model in HTML.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let inCode = false;
  let inUl = false;
  let inOl = false;
  let tableBuf: string[][] = [];

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const flushTable = () => {
    if (tableBuf.length === 0) return;
    const rows = tableBuf.filter((r) => !r.every((c) => /^:?-+:?$/.test(c)));
    if (rows.length === 0) {
      tableBuf = [];
      return;
    }
    html.push("<table>");
    rows.forEach((cols, idx) => {
      const tag = idx === 0 ? "th" : "td";
      html.push("<tr>");
      for (const c of cols) html.push(`<${tag}>${inline(c)}</${tag}>`);
      html.push("</tr>");
    });
    html.push("</table>");
    tableBuf = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flushTable();
      closeLists();
      if (!inCode) {
        inCode = true;
        html.push("<pre><code>");
      } else {
        inCode = false;
        html.push("</code></pre>");
      }
      i++;
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line) + "\n");
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      closeLists();
      const cols = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      tableBuf.push(cols);
      i++;
      continue;
    }
    flushTable();

    if (line.trim() === "") {
      closeLists();
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      closeLists();
      html.push(`<h1>${inline(line.slice(2))}</h1>`);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      closeLists();
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      closeLists();
      html.push(`<h3>${inline(line.slice(4))}</h3>`);
      i++;
      continue;
    }
    const ul = line.match(/^[-*] (.+)$/);
    if (ul) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      i++;
      continue;
    }
    closeLists();
    html.push(`<p>${inline(line)}</p>`);
    i++;
  }
  flushTable();
  closeLists();
  if (inCode) html.push("</code></pre>");
  return html.join("\n");
}

export function wrapDocHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="DotEnvUp threat model. What is encrypted, what is not, and what this tool does not protect against.">
  <link rel="canonical" href="https://dotenvup.com/security">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <style>
    :root { --bg:#0f172a; --text:#e2e8f0; --primary:#6366f1; --border:#334155; --muted:#94a3b8; --code:#1e293b; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; margin: 0; }
    .wrap { max-width: 760px; margin: 0 auto; padding: 2rem; }
    a { color: var(--primary); }
    h1, h2, h3 { color: #fff; }
    h1 { font-size: 2rem; }
    h2 { font-size: 1.35rem; margin-top: 2rem; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
    code { background: var(--code); padding: 0.1em 0.35em; border-radius: 4px; }
    pre { background: #000; border: 1px solid var(--border); padding: 1rem; overflow-x: auto; border-radius: 8px; }
    pre code { background: transparent; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95rem; }
    th, td { border: 1px solid var(--border); padding: 0.5rem 0.65rem; text-align: left; vertical-align: top; }
    th { background: #1e293b; }
    nav { margin-bottom: 2rem; }
    .muted { color: var(--muted); }
  </style>
</head>
<body>
  <div class="wrap">
    <nav><a href="/">DotEnvUp</a> · <a href="https://github.com/sarhej/dotenvup/blob/main/docs/SECURITY.md">Source (SECURITY.md)</a></nav>
    ${bodyHtml}
    <p class="muted">This page is rendered from docs/SECURITY.md so the site and the repo cannot drift apart.</p>
  </div>
</body>
</html>`;
}
