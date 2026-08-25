#!/usr/bin/env bash
set -euo pipefail

# DotEnvUp policy + merge re-encrypt QA harness
# Isolated identities only — never touches real ~/.dotenvup

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_BIN="$ROOT_DIR/packages/cli/dist/bin.js"
POLICY_SCRIPT="$ROOT_DIR/scripts/qa-policy-reencrypt.mjs"

if [ ! -f "$CLI_BIN" ]; then
  echo "[qa-policy] Missing CLI build at $CLI_BIN"
  echo "[qa-policy] Run: npm run build"
  exit 1
fi

QA_ROOT="${DOTENVUP_QA_POLICY_ROOT:-$ROOT_DIR/.qa-fake-project-policy}"
PROJECT_DIR="$QA_ROOT/project"
ALICE_HOME="$QA_ROOT/alice-home"
BOB_HOME="$QA_ROOT/bob-home"
CI_HOME="$QA_ROOT/ci-home"
ALICE_ID="$ALICE_HOME/.dotenvup-test-identity"
BOB_ID="$BOB_HOME/.dotenvup-test-identity"
CI_ID="$CI_HOME/.dotenvup-test-identity"

run_as() {
  local home="$1"
  local id="$2"
  shift 2
  env HOME="$home" USERPROFILE="$home" DOTENVUP_TEST=1 DOTENVUP_NO_PROMPT=1 \
    DOTENVUP_IDENTITY_DIR="$id" DOTENVUP_TEST_IDENTITY_DIR="$id" \
    bash -lc "cd \"$PROJECT_DIR\" && $*" < /dev/null
}

echo "[qa-policy] Resetting $QA_ROOT"
rm -rf "$QA_ROOT"
mkdir -p "$PROJECT_DIR" "$ALICE_HOME" "$BOB_HOME" "$CI_HOME"

cat > "$PROJECT_DIR/.env" <<'EOF'
DB_HOST=localhost
API_KEY=qa-shared
PROD_DB_URL=postgres://alice-only
JWT_SECRET=alice-jwt
EOF

echo "[qa-policy] Generate identities"
run_as "$ALICE_HOME" "$ALICE_ID" "node \"$CLI_BIN\" init --yes"
run_as "$BOB_HOME" "$BOB_ID" "node \"$CLI_BIN\" init --yes"
run_as "$CI_HOME" "$CI_ID" "node \"$CLI_BIN\" init --yes"

echo "[qa-policy] Alice adds Bob + CI recipients"
run_as "$ALICE_HOME" "$ALICE_ID" "node \"$CLI_BIN\" recipients add \"$BOB_ID/identity.pub\" --label bob"
run_as "$ALICE_HOME" "$ALICE_ID" "node \"$CLI_BIN\" recipients add \"$CI_ID/identity.pub\" --label ci"

echo "[qa-policy] Alice initial import (legacy)"
run_as "$ALICE_HOME" "$ALICE_ID" "node \"$CLI_BIN\" import .env --delete"

echo "[qa-policy] Apply [policy] and reencrypt"
node "$POLICY_SCRIPT" "$PROJECT_DIR" "$ALICE_ID"

echo "[qa-policy] Bob unlock — expect 2 keys only"
run_as "$BOB_HOME" "$BOB_ID" "node \"$CLI_BIN\" unlock --duration never --force"

BOB_ENV="$PROJECT_DIR/.env"
grep -q '^DB_HOST=' "$BOB_ENV" || { echo "[qa-policy] FAIL: Bob missing DB_HOST"; exit 1; }
grep -q '^API_KEY=' "$BOB_ENV" || { echo "[qa-policy] FAIL: Bob missing API_KEY"; exit 1; }
grep -q '^PROD_DB_URL=' "$BOB_ENV" && { echo "[qa-policy] FAIL: Bob must not see PROD_DB_URL"; exit 1; }
grep -q '^JWT_SECRET=' "$BOB_ENV" && { echo "[qa-policy] FAIL: Bob must not see JWT_SECRET"; exit 1; }

echo "[qa-policy] Bob edits API_KEY and merge-imports"
cat > "$PROJECT_DIR/.env" <<'EOF'
DB_HOST=localhost
API_KEY=bob-updated
EOF
run_as "$BOB_HOME" "$BOB_ID" "node \"$CLI_BIN\" import .env --delete"

echo "[qa-policy] Alice unlock — Alice-only keys preserved (her block until she re-imports)"
run_as "$ALICE_HOME" "$ALICE_ID" "node \"$CLI_BIN\" unlock --duration never --force"
ALICE_ENV="$PROJECT_DIR/.env"
grep -q '^PROD_DB_URL=' "$ALICE_ENV" || { echo "[qa-policy] FAIL: Alice lost PROD_DB_URL"; exit 1; }
grep -q 'API_KEY=qa-shared' "$ALICE_ENV" || { echo "[qa-policy] FAIL: Alice block should still hold her API_KEY until she re-imports"; exit 1; }

echo "[qa-policy] Alice syncs shared API_KEY — bob block updates via owner full reencrypt"
cat > "$PROJECT_DIR/.env" <<'EOF'
DB_HOST=localhost
API_KEY=bob-updated
PROD_DB_URL=postgres://alice-only
JWT_SECRET=alice-jwt
EOF
run_as "$ALICE_HOME" "$ALICE_ID" "node \"$CLI_BIN\" import .env --delete"

echo "[qa-policy] Bob unlock — should see bob-updated without re-importing"
run_as "$BOB_HOME" "$BOB_ID" "node \"$CLI_BIN\" unlock --duration never --force"
grep -q 'API_KEY=bob-updated' "$PROJECT_DIR/.env" || { echo "[qa-policy] FAIL: Bob should get synced API_KEY from Alice import"; exit 1; }
run_as "$BOB_HOME" "$BOB_ID" "node \"$CLI_BIN\" lock --yes"

run_as "$ALICE_HOME" "$ALICE_ID" "node \"$CLI_BIN\" lock --yes"

echo "[qa-policy] Alice revokes Bob — policy row + block removed"
run_as "$ALICE_HOME" "$ALICE_ID" "node \"$CLI_BIN\" recipients remove bob"
grep -q 'recipient:bob' "$PROJECT_DIR/.env.up" && { echo "[qa-policy] FAIL: Bob block should be removed"; exit 1; }

echo "[qa-policy] CI run — only API_KEY exposed"
run_as "$CI_HOME" "$CI_ID" "node \"$CLI_BIN\" run -- node -e \"
const want = ['API_KEY'];
const got = ['API_KEY','PROD_DB_URL','DB_HOST','JWT_SECRET'].filter(k => process.env[k] !== undefined);
if (got.sort().join() !== want.sort().join()) { console.error('got', got); process.exit(2); }
\""

echo "[qa-policy] verify passes"
run_as "$ALICE_HOME" "$ALICE_ID" "node \"$CLI_BIN\" verify"

echo "[qa-policy] PASS: policy + merge harness completed"
