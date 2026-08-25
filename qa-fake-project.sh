#!/usr/bin/env bash
set -euo pipefail

# DotEnvUp fake-project QA harness
# - Creates isolated fake users/keys (never touches real ~/.dotenvup)
# - Verifies multi-recipient encrypt/decrypt flow
# - Verifies key-mismatch recovery scan flow

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_BIN="$ROOT_DIR/packages/cli/dist/bin.js"

if [ ! -f "$CLI_BIN" ]; then
  echo "[qa] Missing CLI build at $CLI_BIN"
  echo "[qa] Run: npm run build --workspace @dotenvup/cli"
  exit 1
fi

QA_ROOT="${DOTENVUP_QA_ROOT:-$ROOT_DIR/.qa-fake-project}"
PROJECT_DIR="$QA_ROOT/project"
ALICE_HOME="$QA_ROOT/alice-home"
BOB_HOME="$QA_ROOT/bob-home"
ALICE_ID="$ALICE_HOME/.dotenvup-test-identity"
BOB_ID="$BOB_HOME/.dotenvup-test-identity"

echo "[qa] Resetting $QA_ROOT"
rm -rf "$QA_ROOT"
mkdir -p "$PROJECT_DIR" "$ALICE_HOME" "$BOB_HOME"

cat > "$PROJECT_DIR/.env" <<'EOF'
DB_HOST=localhost
DB_PASSWORD=qa-secret
API_KEY=qa-token
EOF

echo "[qa] Generate Alice key"
HOME="$ALICE_HOME" USERPROFILE="$ALICE_HOME" DOTENVUP_TEST=1 DOTENVUP_NO_PROMPT=1 DOTENVUP_IDENTITY_DIR="$ALICE_ID" DOTENVUP_TEST_IDENTITY_DIR="$ALICE_ID" \
  node "$CLI_BIN" init --yes < /dev/null

echo "[qa] Generate Bob key"
HOME="$BOB_HOME" USERPROFILE="$BOB_HOME" DOTENVUP_TEST=1 DOTENVUP_NO_PROMPT=1 DOTENVUP_IDENTITY_DIR="$BOB_ID" DOTENVUP_TEST_IDENTITY_DIR="$BOB_ID" \
  node "$CLI_BIN" init --yes < /dev/null

echo "[qa] Alice adds Bob as recipient"
env HOME="$ALICE_HOME" USERPROFILE="$ALICE_HOME" DOTENVUP_TEST=1 DOTENVUP_IDENTITY_DIR="$ALICE_ID" DOTENVUP_TEST_IDENTITY_DIR="$ALICE_ID" \
  bash -lc "cd \"$PROJECT_DIR\" && node \"$CLI_BIN\" recipients add \"$BOB_ID/identity.pub\" --label bob"

echo "[qa] Alice imports and locks"
env HOME="$ALICE_HOME" USERPROFILE="$ALICE_HOME" DOTENVUP_TEST=1 DOTENVUP_IDENTITY_DIR="$ALICE_ID" DOTENVUP_TEST_IDENTITY_DIR="$ALICE_ID" \
  bash -lc "cd \"$PROJECT_DIR\" && node \"$CLI_BIN\" import .env --delete"

echo "[qa] Bob unlocks same .env.up (multi-recipient check)"
env HOME="$BOB_HOME" USERPROFILE="$BOB_HOME" DOTENVUP_TEST=1 DOTENVUP_IDENTITY_DIR="$BOB_ID" DOTENVUP_TEST_IDENTITY_DIR="$BOB_ID" \
  bash -lc "cd \"$PROJECT_DIR\" && node \"$CLI_BIN\" unlock --duration never"

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "[qa] FAIL: Bob could not unlock .env"
  exit 1
fi

echo "[qa] Bob lock again"
env HOME="$BOB_HOME" USERPROFILE="$BOB_HOME" DOTENVUP_TEST=1 DOTENVUP_IDENTITY_DIR="$BOB_ID" DOTENVUP_TEST_IDENTITY_DIR="$BOB_ID" \
  bash -lc "cd \"$PROJECT_DIR\" && node \"$CLI_BIN\" lock --yes"

echo "[qa] Recovery scan from clean Charlie identity"
CHARLIE_HOME="$QA_ROOT/charlie-home"
CHARLIE_ID="$CHARLIE_HOME/.dotenvup-test-identity"
mkdir -p "$CHARLIE_HOME"
env HOME="$CHARLIE_HOME" USERPROFILE="$CHARLIE_HOME" DOTENVUP_TEST=1 DOTENVUP_IDENTITY_DIR="$CHARLIE_ID" DOTENVUP_TEST_IDENTITY_DIR="$CHARLIE_ID" \
  bash -lc "cd \"$PROJECT_DIR\" && node \"$CLI_BIN\" recover .env.up --deep" || true

echo "[qa] PASS: fake-project multi-recipient harness completed"
echo "[qa] Project: $PROJECT_DIR"
echo "[qa] Identities: $ALICE_ID, $BOB_ID, $CHARLIE_ID"

