#!/usr/bin/env bash
#
# Packs the bot's authenticated Chrome profile into a base64 gzipped tarball
# suitable for pasting into a Northflank secret file.
#
# Usage:
#   npm run login            # sign the bot in first (populates bot-profile-basic/)
#   npm run pack-profile     # produces bot-profile.b64
#
# Then in Northflank: create a secret FILE, paste the contents of
# bot-profile.b64, mount it into the service, and set BOT_PROFILE_SEED_FILE to
# the mount path. (Or paste into an env var BOT_PROFILE_B64 if small enough.)
#
# IMPORTANT: Chrome encrypts cookies with a per-OS key, so a profile created on
# macOS/Windows may not decrypt inside the Linux container. Generate the profile
# on Linux (same environment as the deployment) if the seeded bot shows up
# logged out. See the README notes.
set -euo pipefail

PROFILE_DIR="${1:-bot-profile-basic}"
OUT="${2:-bot-profile.b64}"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "Profile directory '$PROFILE_DIR' not found. Run 'npm run login' first." >&2
  exit 1
fi

# Exclude bulky, non-auth caches so the secret stays small.
tar czf - -C "$PROFILE_DIR" \
  --exclude='./Default/Cache' \
  --exclude='./Default/Code Cache' \
  --exclude='./Default/GPUCache' \
  --exclude='./Default/DawnCache' \
  --exclude='./Default/DawnGraphiteCache' \
  --exclude='./Default/DawnWebGPUCache' \
  --exclude='./Default/GrShaderCache' \
  --exclude='./Default/Service Worker/CacheStorage' \
  --exclude='./Default/Service Worker/ScriptCache' \
  --exclude='./GrShaderCache' \
  --exclude='./ShaderCache' \
  --exclude='./component_crx_cache' \
  . | base64 > "$OUT"

BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo "Wrote $OUT ($BYTES bytes)."
echo "Paste its contents into a Northflank secret file and point BOT_PROFILE_SEED_FILE at the mount path."
if [ "$BYTES" -gt 512000 ]; then
  echo "NOTE: >512KB — use a Northflank secret FILE (not an env var) for this."
fi
