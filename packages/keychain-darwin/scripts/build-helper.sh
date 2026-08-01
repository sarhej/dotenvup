#!/usr/bin/env bash
# Build (and optionally sign + notarize) dotenvup-keychain for macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SWIFT_SRC="$ROOT/swift/main.swift"
BIN_DIR="$ROOT/bin"
OUT="$BIN_DIR/dotenvup-keychain"
SIGN_IDENTITY="${DOTENVUP_CODESIGN_IDENTITY:-Developer ID Application: Pamakid s.r.o. (85W68GBU9V)}"
NOTARY_PROFILE="${DOTENVUP_NOTARY_PROFILE:-dotenvup}"
# UserPresence Keychain ACL requires a real code signature (-34018 if ad-hoc).
# Default: sign when the identity is in the keychain; set DOTENVUP_CODESIGN=0 to skip.
if [[ -z "${DOTENVUP_CODESIGN:-}" ]]; then
  if security find-identity -v -p codesigning 2>/dev/null | grep -F "$SIGN_IDENTITY" >/dev/null; then
    DO_SIGN=1
  else
    DO_SIGN=0
  fi
else
  DO_SIGN="${DOTENVUP_CODESIGN}"
fi
DO_NOTARIZE="${DOTENVUP_NOTARIZE:-0}"

mkdir -p "$BIN_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-helper.sh: macOS only" >&2
  exit 1
fi

ARCHS=("arm64" "x86_64")
TMP_BINS=()
for arch in "${ARCHS[@]}"; do
  tmp="$(mktemp -t dotenvup-keychain-${arch})"
  swiftc -O -target "${arch}-apple-macosx13.0" \
    -framework Security -framework LocalAuthentication -framework AppKit \
    "$SWIFT_SRC" -o "$tmp"
  TMP_BINS+=("$tmp")
done

lipo -create "${TMP_BINS[@]}" -output "$OUT"
chmod 755 "$OUT"
rm -f "${TMP_BINS[@]}"

echo "Built universal binary: $OUT"
file "$OUT"

if [[ "$DO_SIGN" == "1" ]]; then
  codesign --force --options runtime --timestamp \
    --sign "$SIGN_IDENTITY" \
    "$OUT"
  codesign --verify --verbose=2 "$OUT"
  echo "Signed with: $SIGN_IDENTITY"
fi

if [[ "$DO_NOTARIZE" == "1" ]]; then
  if [[ "$DO_SIGN" != "1" ]]; then
    echo "DOTENVUP_NOTARIZE=1 requires DOTENVUP_CODESIGN=1" >&2
    exit 1
  fi
  zip_path="$(mktemp -t dotenvup-keychain).zip"
  ditto -c -k --keepParent "$OUT" "$zip_path"
  xcrun notarytool submit "$zip_path" --keychain-profile "$NOTARY_PROFILE" --wait
  rm -f "$zip_path"
  # Staple embeds the ticket (best for .app/.pkg/.dmg). Bare Mach-O often fails staple
  # with error 73; Gatekeeper still accepts via online ticket lookup after "Accepted".
  if xcrun stapler staple "$OUT" 2>/dev/null; then
    echo "Stapled notarization ticket onto $OUT"
  else
    echo "Note: stapler skipped/failed for bare binary (expected). Notary status Accepted is enough for online Gatekeeper."
  fi
  spctl -a -vv --type execute "$OUT" 2>&1 || true
  echo "Notarization complete for $OUT"
fi
