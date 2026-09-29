#!/usr/bin/env bash
# EXAMPLE RECIPE (not a DotEnvUp product CLI) — copy into your app repo as
# scripts/sync-netlify-env-to-dotenvup.sh and adapt. Same pattern works for
# Railway / Vercel / etc.: host CLI dumps env → brief .env → `up import --delete`.
#
# Pull a Netlify context into encrypted DotEnvUp vault (.env.up).
# Values never printed. Plaintext .env exists only briefly, then is deleted.
#
# Prefer a non-prod context when seeding agents (deploy-preview / custom staging).
# Use production when you need local build/deploy parity (e.g. CI minutes exhausted).
#
# Usage (from your app repo root — script cds to parent of scripts/):
#   ./scripts/sync-netlify-env-to-dotenvup.sh --context=deploy-preview
#   ./scripts/sync-netlify-env-to-dotenvup.sh --context=production
#   ./scripts/sync-netlify-env-to-dotenvup.sh --dry-run          # key names only
#   ./scripts/sync-netlify-env-to-dotenvup.sh --replace          # drop local-only keys
#
# Prerequisites: netlify CLI linked (or NETLIFY_AUTH_TOKEN), `up` installed.
# After sync, build/deploy without leaving secrets on disk:
#   up run -- npm run build
#   up run -- netlify deploy --prod --dir=dist --no-build
#
# Docs: https://github.com/sarhej/dotenvup/blob/main/docs/USER_GUIDE.md
#       (Mirror host env / agent-ready repos)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTEXT="deploy-preview"
DRY_RUN=0
REPLACE=0
WROTE_ENV=0

for arg in "$@"; do
  case "$arg" in
    --context)
      echo "❌ Use --context=<name> (e.g. --context=production)" >&2
      exit 1
      ;;
    --context=*)
      CONTEXT="${arg#--context=}"
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --replace)
      REPLACE=1
      ;;
    -h|--help)
      sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $0 [--context=deploy-preview|production|…] [--dry-run] [--replace]" >&2
      exit 1
      ;;
  esac
done

die() {
  echo "❌ $*" >&2
  exit 1
}

TMP_JSON=""
EXISTING_ENV=""

cleanup() {
  local code=$?
  rm -f "${TMP_JSON:-}" "${EXISTING_ENV:-}"
  # If we wrote plaintext .env and did not finish import, scrub it.
  if [[ "$WROTE_ENV" -eq 1 && -f "$ROOT/.env" ]]; then
    if [[ ! -f "$ROOT/.env.up" ]] || ! up status --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("locked") or d.get("lockStatus")=="LOCKED" else 1)' 2>/dev/null; then
      # Prefer DotEnvUp lock when vault exists; otherwise delete leftover plaintext.
      if [[ -f "$ROOT/.env.up" ]]; then
        up lock --yes >/dev/null 2>&1 || rm -f "$ROOT/.env"
      else
        rm -f "$ROOT/.env"
      fi
      echo "⚠ Removed leftover plaintext .env after incomplete run" >&2
    fi
  fi
  exit "$code"
}
trap cleanup EXIT

command -v netlify >/dev/null 2>&1 || die "netlify CLI not found (npm i -g netlify-cli)"
command -v up >/dev/null 2>&1 || die "DotEnvUp CLI 'up' not found (https://github.com/sarhej/dotenvup)"
command -v python3 >/dev/null 2>&1 || die "python3 not found"

if ! netlify status >/dev/null 2>&1; then
  die "Netlify not linked. Run: netlify login && netlify link"
fi

echo "→ Fetching Netlify env (context=$CONTEXT) — values not shown…"
TMP_JSON="$(mktemp -t netlify-env.XXXXXX.json)"

if ! netlify env:list --context "$CONTEXT" --json >"$TMP_JSON" 2>/dev/null; then
  die "netlify env:list failed. Check login/link and context '$CONTEXT'."
fi

KEY_COUNT="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(len(d) if isinstance(d, dict) else 0)' "$TMP_JSON")"
[[ "$KEY_COUNT" -gt 0 ]] || die "No env keys returned for context '$CONTEXT'."

echo "→ Netlify keys ($KEY_COUNT):"
python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
for k in sorted(d):
    print(f"   {k}")
' "$TMP_JSON"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "✅ Dry run only — nothing written."
  WROTE_ENV=0
  exit 0
fi

# Ensure DotEnvUp identity exists (no-op if already configured)
if ! up status >/dev/null 2>&1; then
  echo "→ DotEnvUp identity missing — running up init…"
  up init
fi

# Merge with existing vault keys unless --replace
if [[ "$REPLACE" -eq 0 && -f "$ROOT/.env.up" ]]; then
  echo "→ Merging with existing .env.up (Netlify wins on conflicts; use --replace to drop local-only keys)…"
  EXISTING_ENV="$(mktemp -t dotenvup-base.XXXXXX.env)"
  # Decrypt to stdout → temp file only (not echoed). Prefer show; fall back to unlock.
  if up show >"$EXISTING_ENV" 2>/dev/null && [[ -s "$EXISTING_ENV" ]]; then
    :
  else
    if [[ ! -f "$ROOT/.env" ]]; then
      up unlock --duration 5m >/dev/null
    fi
    [[ -f "$ROOT/.env" ]] || die "Could not decrypt existing .env.up for merge."
    cp "$ROOT/.env" "$EXISTING_ENV"
    up lock --yes >/dev/null 2>&1 || true
  fi
fi

ENV_OUT="$ROOT/.env"
python3 - "$TMP_JSON" "$ENV_OUT" "${EXISTING_ENV:-}" <<'PY'
import json, os, re, sys

src_json, out_path, existing = sys.argv[1], sys.argv[2], sys.argv[3]


def parse_env(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path or not os.path.isfile(path):
        return out
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :]
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
                quote = v[0]
                v = v[1:-1]
                if quote == '"':
                    v = (
                        v.replace("\\n", "\n")
                        .replace("\\r", "\r")
                        .replace('\\"', '"')
                        .replace("\\\\", "\\")
                    )
            out[k] = v
    return out


def encode_env(k: str, v: str) -> str:
    if re.search(r'[\s#"\'\\$`]', v) or "\n" in v or v == "":
        esc = (
            v.replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
        )
        return f'{k}="{esc}"'
    return f"{k}={v}"


merged = parse_env(existing)
netlify = json.load(open(src_json, encoding="utf-8"))
if not isinstance(netlify, dict):
    raise SystemExit("unexpected netlify env:list JSON shape")

for k, v in netlify.items():
    if v is None:
        continue
    merged[str(k)] = str(v)

with open(out_path, "w", encoding="utf-8") as f:
    f.write("# Generated by scripts/sync-netlify-env-to-dotenvup.sh — do not commit\n")
    f.write("# Encrypted into .env.up via `up import`; plaintext deleted immediately.\n")
    for k in sorted(merged):
        f.write(encode_env(k, merged[k]) + "\n")

print(f"wrote {len(merged)} keys to .env (values not printed)", flush=True)
PY
WROTE_ENV=1

# Attach linked site id when missing (public identifier)
if ! grep -q '^NETLIFY_SITE_ID=' "$ENV_OUT" 2>/dev/null; then
  SITE_ID="$(
    netlify status --json 2>/dev/null | python3 -c '
import json, sys
d = json.load(sys.stdin)
for path in (
    ("siteInformation", "id"),
    ("siteInfo", "id"),
    ("site", "id"),
):
    cur = d
    ok = True
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            ok = False
            break
        cur = cur[p]
    if ok and cur:
        print(cur)
        break
' 2>/dev/null || true
  )"
  if [[ -n "${SITE_ID:-}" ]]; then
    echo "NETLIFY_SITE_ID=${SITE_ID}" >>"$ENV_OUT"
    echo "→ Added NETLIFY_SITE_ID from linked site"
  fi
fi

echo "→ Encrypting into .env.up and deleting plaintext .env…"
up import "$ENV_OUT" --delete
WROTE_ENV=0

echo
echo "✅ Done. Vault: $ROOT/.env.up"
up status || true
echo
echo "Next:"
echo "  up run -- npm run build"
echo "  up run -- netlify deploy --prod --dir=dist --no-build"
echo
echo "Optional: add NETLIFY_AUTH_TOKEN for non-interactive deploy"
echo "  up unlock --duration 15m   # edit .env, then: up import .env --delete"
echo
echo "Safe to commit: .env.up (encrypted). Never commit .env"
