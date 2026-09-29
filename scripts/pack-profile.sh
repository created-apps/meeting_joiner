#!/usr/bin/env bash
#
# Packs the bot's portable Playwright authentication state into a base64
# gzipped tarball suitable for seeding the Railway profile volume.
#
# Usage:
#   npm run login            # sign the bot in first (populates bot-profile-basic/)
#   npm run pack-profile     # produces bot-profile.b64
#
# The exported auth-state.json contains decrypted cookies and browser storage,
# so it can be generated on macOS/Windows and imported on Railway Linux.
set -euo pipefail

PROFILE_DIR="${1:-bot-profile-basic}"
OUT="${2:-bot-profile.b64}"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "Profile directory '$PROFILE_DIR' not found. Run 'npm run login' first." >&2
  exit 1
fi

AUTH_STATE_FILE="$PROFILE_DIR/auth-state.json"
if [ ! -f "$AUTH_STATE_FILE" ]; then
  echo "Portable auth state '$AUTH_STATE_FILE' not found. Run 'npm run login' first." >&2
  exit 1
fi

tar czf - -C "$PROFILE_DIR" auth-state.json | base64 | tr -d '\n' > "$OUT"

BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo "Wrote $OUT ($BYTES bytes)."
echo "Upload this seed through your configured Railway volume bootstrap method."
