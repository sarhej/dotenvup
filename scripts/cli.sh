#!/usr/bin/env bash
# DotEnvUp CLI-token wrapper (generic; Railway / GitHub are examples).
#
# Store the CLI's API token in .env.up once. Agents then run tools as you
# without `railway login` / `gh auth login` (those overwrite personal accounts).
#
# Bare `railway` / `gh` fall through to the user's global login if the token is
# missing — this wrapper refuses instead.
#
# Usage:
#   ./scripts/cli.sh status
#   ./scripts/cli.sh whoami [name...]
#   ./scripts/cli.sh railway …          # example
#   ./scripts/cli.sh gh …               # example
#   ./scripts/cli.sh run --require TOKEN [--as EXPORT] -- <cmd> [args]
#   source scripts/cli.sh env           # interactive shell only; values not printed
#
# Do not invent token values. Do not print them.

set -euo pipefail

# name|required_key|export_as|whoami_argv
# Add a line to support another CLI. required_key must exist (non-empty) in .env.up.
SERVICES='railway|RAILWAY_API_TOKEN|RAILWAY_TOKEN|railway whoami
gh|GH_TOKEN|GH_TOKEN|gh api user --jq .login'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"

die() {
  echo "cli.sh: $*" >&2
  exit 1
}

valid_key() {
  [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]
}

is_sourced() {
  if [ -n "${ZSH_VERSION:-}" ]; then
    case "${ZSH_EVAL_CONTEXT:-}" in *:file*) return 0 ;; esac
    return 1
  fi
  [ -n "${BASH_VERSION:-}" ] && [ "${BASH_SOURCE[0]}" != "$0" ]
}

login_blocked() {
  local i=1 arg next
  while [ $i -le $# ]; do
    eval "arg=\${$i}"
    case "$arg" in
      login | logout) return 0 ;;
      auth)
        next=$((i + 1))
        if [ "$next" -le $# ]; then
          eval "next=\${$next}"
          case "$next" in login | logout | refresh | switch) return 0 ;; esac
        fi
        ;;
    esac
    i=$((i + 1))
  done
  return 1
}

service_row() {
  local name="$1" line
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      "${name}"\|*) echo "$line"; return 0 ;;
    esac
  done <<EOF
$SERVICES
EOF
  return 1
}

# True if KEY is non-empty in .env.up. Never prints the value.
token_present() {
  local key="$1"
  valid_key "$key" || die "invalid key name: $key"
  if [ "$key" = "GH_TOKEN" ]; then
    # Child expands after `up run` injects env; do not expand here.
    # shellcheck disable=SC2016
    (cd "$ROOT" && up run -- sh -c 'test -n "${GH_TOKEN}${GITHUB_TOKEN}"')
  else
    # shellcheck disable=SC2016
    (cd "$ROOT" && up run -- sh -c 'test -n "${'"$key"'}"')
  fi
}

require_up() {
  command -v up >/dev/null 2>&1 || {
    echo "cli.sh: up not found. Install: npm i -g @dotenvup/cli" >&2
    return 1
  }
  [ -f "$ROOT/.env.up" ] || {
    echo "cli.sh: .env.up not found. Run: up import .env" >&2
    return 1
  }
}

cmd_status() {
  require_up || exit 1
  echo "CLI tokens in dotenvup (names only):"
  local line name key export_as rest present
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    IFS='|' read -r name key export_as rest <<<"$line"
    if token_present "$key"; then
      present="present"
    else
      present="missing"
    fi
    if [ "$key" = "$export_as" ]; then
      printf '  %-12s  %s  (%s)\n' "$name" "$present" "$key"
    else
      printf '  %-12s  %s  (%s → %s)\n' "$name" "$present" "$key" "$export_as"
    fi
  done <<EOF
$SERVICES
EOF
}

cmd_whoami() {
  require_up || exit 1
  local filter="${1:-}"
  local line name key export_as whoami
  local any=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    IFS='|' read -r name key export_as whoami <<<"$line"
    if [ -n "$filter" ]; then
      local want=0 f
      for f in "$@"; do
        [ "$f" = "$name" ] && want=1
      done
      [ "$want" = 1 ] || continue
    fi
    any=1
    echo "== $name =="
    if ! token_present "$key"; then
      echo "skip: $key missing — not using personal CLI login"
      echo
      continue
    fi
    # shellcheck disable=SC2086
    cmd_run --require "$key" --as "$export_as" -- $whoami
    echo
  done <<EOF
$SERVICES
EOF
  [ "$any" = 1 ] || die "unknown CLI name. Known examples: railway, gh"
}

# Run a command with dotenvup env. Known CLIs must pass --require so we never
# fall through to a personal login. --as copies required_key to the name the
# binary actually reads (e.g. RAILWAY_API_TOKEN → RAILWAY_TOKEN).
cmd_run() {
  require_up || exit 1
  local require="" as=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --require)
        require="${2:-}"
        [ -n "$require" ] || die "--require needs a key name"
        shift 2
        ;;
      --as)
        as="${2:-}"
        [ -n "$as" ] || die "--as needs an env name"
        shift 2
        ;;
      --)
        shift
        break
        ;;
      -*)
        die "unknown flag: $1"
        ;;
      *)
        break
        ;;
    esac
  done
  [ $# -gt 0 ] || die "usage: cli.sh run [--require KEY] [--as EXPORT] -- <cmd> [args]"

  if login_blocked "$@"; then
    die "refusing $* — this wrapper never runs login/logout (would overwrite personal CLI accounts). Store a token in .env.up instead."
  fi

  # Known CLIs (railway, gh, …) must not run without their project token — same as named shortcuts.
  if [ -z "$require" ] && [ $# -gt 0 ]; then
    local first="$1"
    if service_row "$first" >/dev/null 2>&1; then
      local row key export_as
      row="$(service_row "$first")"
      IFS='|' read -r _ key export_as _ <<<"$row"
      require="$key"
      as="$export_as"
    fi
  fi

  if [ -n "$require" ]; then
    if ! token_present "$require"; then
      echo "cli.sh: $require is missing in dotenvup." >&2
      echo "  User adds the real token (agents must not invent it):" >&2
      echo "    up unlock --duration 15m" >&2
      echo "    # in .env:  ${require}=…" >&2
      echo "    up import .env --delete && up lock --yes" >&2
      exit 1
    fi
  fi

  if [ -n "$require" ]; then
    valid_key "$require" || die "invalid key name: $require"
  fi
  local export_as="${as:-$require}"
  if [ -n "$export_as" ]; then
    valid_key "$export_as" || die "invalid export name: $export_as"
  fi
  if [ -n "$require" ] && [ -n "$export_as" ] && [ "$export_as" != "$require" ]; then
    # shellcheck disable=SC2016
    (cd "$ROOT" && up run -- sh -c 'export '"$export_as"'="${'"$require"'}"; exec "$@"' _ "$@")
  else
    (cd "$ROOT" && up run -- "$@")
  fi
}

cmd_named() {
  local name="$1"
  shift
  local row key export_as
  row="$(service_row "$name")" || die "unknown CLI '$name'. Use: cli.sh run --require KEY [--as EXPORT] -- <cmd> …"
  IFS='|' read -r _ key export_as _ <<<"$row"
  if login_blocked "$@"; then
    die "refusing $name $* — never login/logout via this wrapper."
  fi
  cmd_run --require "$key" --as "$export_as" -- "$name" "$@"
}

# Interactive only. Exports mapped CLI vars into the current shell; does not print values.
# Agents must not use this (tool logs can capture exports). Use cli.sh railway / run instead.
cmd_env() {
  require_up || return 1
  if ! is_sourced; then
    die "do not execute cli.sh env (that would print tokens). In an interactive shell: source scripts/cli.sh env"
  fi
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    echo "cli.sh: refusing env in a non-interactive session (tokens could leak into agent logs)." >&2
    echo "Use: ./scripts/cli.sh railway …  or  ./scripts/cli.sh run --require KEY -- cmd" >&2
    return 1
  fi
  local line name key export_as rest snippet
  snippet="$(
    cd "$ROOT" && up run -- python3 -c '
import os, shlex
services = """'"$SERVICES"'""".strip().splitlines()
seen = set()
for line in services:
    if not line.strip():
        continue
    _name, key, export_as, _who = line.split("|", 3)
    val = os.environ.get(key) or ""
    if key == "GH_TOKEN" and not val:
        val = os.environ.get("GITHUB_TOKEN") or ""
    if not val or export_as in seen:
        continue
    seen.add(export_as)
    print(f"export {export_as}={shlex.quote(val)}")
'
  )"
  eval "$snippet"
  echo "cli.sh: exported CLI tokens into this shell (values not shown)." >&2
}

usage() {
  cat <<'EOF'
DotEnvUp CLI-token wrapper — run user CLIs with tokens from .env.up.

  ./scripts/cli.sh status
  ./scripts/cli.sh whoami [railway|gh]
  ./scripts/cli.sh railway <args>     # example
  ./scripts/cli.sh gh <args>          # example
  ./scripts/cli.sh run --require KEY [--as EXPORT] -- <cmd> [args]
  source scripts/cli.sh env           # interactive shell only

Never login/logout. Never print token values. Never invent tokens.
Bare CLIs fall through to personal accounts if the token is missing — this
wrapper refuses instead. Copy this script into other repos; add a SERVICES line.
EOF
}

main() {
  local cmd="${1:-}"
  if [ -z "$cmd" ]; then
    usage
    exit 1
  fi
  shift || true
  case "$cmd" in
    status) cmd_status "$@" ;;
    whoami) cmd_whoami "$@" ;;
    run) cmd_run "$@" ;;
    env) cmd_env "$@" ;;
    railway | gh) cmd_named "$cmd" "$@" ;;
    -h | --help | help) usage ;;
    *)
      usage >&2
      die "unknown command: $cmd"
      ;;
  esac
}

if is_sourced; then
  if [ "${1:-}" = "env" ]; then
    cmd_env
  else
    echo "cli.sh: sourced. Use: source scripts/cli.sh env" >&2
  fi
  return 0
else
  main "$@"
fi
