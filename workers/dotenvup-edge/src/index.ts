/**
 * Serves dotenvup.com from GitHub raw (docs/) so we can add headers and Accept
 * negotiation without a redirect loop from username.github.io → custom domain.
 *
 * SPDX-License-Identifier: MIT
 */

const OIDC_DELEGATE = "https://unknownpassword.com/.well-known/openid-configuration";
const OAUTH_AS_DELEGATE = "https://unknownpassword.com/.well-known/oauth-authorization-server";

const LINK_HEADER =
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", ' +
  '</.well-known/openapi/dotenvup.json>; rel="service-desc"; type="application/json", ' +
  '<https://github.com/sarhej/dotenvup/blob/main/docs/USER_GUIDE.md>; rel="service-doc", ' +
  '<https://github.com/sarhej/dotenvup/blob/main/AGENTS.md>; rel="service-doc", ' +
  '</markdown.md>; rel="alternate"; type="text/markdown", ' +
  '</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", ' +
  '</llms.txt>; rel="describedby"; type="text/plain"';

export interface Env {
  GITHUB_REF: string;
}

function rawBase(env: Env): string {
  const ref = env.GITHUB_REF || "main";
  return `https://raw.githubusercontent.com/sarhej/dotenvup/${ref}/docs`;
}

function normalizePathname(url: URL): string {
  let p = url.pathname;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p === "") p = "/";
  return p;
}

function isSafePath(pathname: string): boolean {
  if (!pathname || pathname.includes("..")) return false;
  if (pathname === "/" || pathname === "/index.html") return true;
  if (pathname.startsWith("/assets/")) return true;
  if (pathname.startsWith("/.well-known/")) return true;
  const exact = new Set([
    "/robots.txt",
    "/sitemap.xml",
    "/privacy.html",
    "/llms.txt",
    "/markdown.md",
    "/favicon.ico",
  ]);
  return exact.has(pathname);
}

function upstreamPath(pathname: string): string {
  return pathname === "/" || pathname === "" ? "/index.html" : pathname;
}

function contentTypeForPath(pathname: string): string | undefined {
  if (pathname === "/.well-known/api-catalog" || pathname.endsWith("/api-catalog")) {
    return 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';
  }
  if (
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname.endsWith("/oauth-protected-resource")
  ) {
    return "application/json; charset=utf-8";
  }
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".webmanifest")) return "application/manifest+json";
  return undefined;
}

function wantsMarkdown(request: Request): boolean {
  const accept = request.headers.get("Accept") || "";
  return /\btext\/markdown\b/i.test(accept);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function fetchRaw(env: Env, pathname: string, method: string): Promise<Response> {
  const path = upstreamPath(pathname);
  const url = `${rawBase(env)}${path}`;
  return fetch(url, { method, redirect: "follow" });
}

async function delegateJsonMetadata(
  sourceUrl: string,
  method: string,
): Promise<Response> {
  const r = await fetch(sourceUrl, { method, redirect: "follow" });
  const body = method === "HEAD" ? null : await r.text();
  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (r.ok) headers.set("Cache-Control", "public, max-age=300");
  headers.set("Vary", "Accept");
  return new Response(body, { status: r.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizePathname(url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (pathname === "/.well-known/openid-configuration") {
      return delegateJsonMetadata(OIDC_DELEGATE, request.method);
    }

    if (pathname === "/.well-known/oauth-authorization-server") {
      return delegateJsonMetadata(OAUTH_AS_DELEGATE, request.method);
    }

    const homePath = pathname === "/" || pathname === "/index.html";
    if (homePath && wantsMarkdown(request)) {
      if (request.method === "HEAD") {
        const mdh = await fetchRaw(env, "/markdown.md", "HEAD");
        const headers = new Headers();
        headers.set("Content-Type", "text/markdown; charset=utf-8");
        headers.set("Link", LINK_HEADER);
        headers.set("Vary", "Accept");
        const cl = mdh.headers.get("content-length");
        const approx = cl ? Math.max(1, Math.ceil(Number(cl) / 4)) : 1;
        headers.set("x-markdown-tokens", String(approx));
        headers.set("Cache-Control", "public, max-age=60");
        return new Response(null, { status: mdh.ok ? 200 : 502, headers });
      }
      const md = await fetchRaw(env, "/markdown.md", "GET");
      if (!md.ok) {
        return new Response("Markdown mirror unavailable", { status: 502 });
      }
      const text = await md.text();
      const headers = new Headers();
      headers.set("Content-Type", "text/markdown; charset=utf-8");
      headers.set("Link", LINK_HEADER);
      headers.set("Vary", "Accept");
      headers.set("x-markdown-tokens", String(estimateTokens(text)));
      headers.set("Cache-Control", "public, max-age=60");
      return new Response(text, { status: 200, headers });
    }

    if (!isSafePath(pathname)) {
      return new Response("Not Found", { status: 404 });
    }

    const upstream = await fetchRaw(env, pathname, request.method);
    const headers = new Headers(upstream.headers);

    const overrideType = contentTypeForPath(pathname);
    if (overrideType) {
      headers.set("Content-Type", overrideType);
    }

    if (homePath && upstream.ok) {
      headers.set("Link", LINK_HEADER);
    }

    if (homePath || pathname === "/markdown.md") {
      headers.set("Vary", "Accept");
    }

    headers.delete("content-security-policy");

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
