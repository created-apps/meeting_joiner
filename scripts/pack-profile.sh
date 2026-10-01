#!/usr/bin/env bash
#
# Packs the bot's authenticated Chrome profile into a base64 gzipped tarball
# suitable for uploading to private object storage.
#
# Usage:
#   npm run login            # sign the bot in first (populates bot-profile-basic/current/)
#   npm run pack-profile     # produces bot-profile.b64
#
# Upload bot-profile.b64 to Supabase Storage or R2, create a temporary signed
# GET URL, and set that URL as BOT_PROFILE_URL in Railway.
#
# IMPORTANT: Chrome encrypts cookies with a per-OS key, so a profile created on
# macOS/Windows may not decrypt inside the Linux container. Generate the profile
# on Linux (same environment as the deployment) if the seeded bot shows up
# logged out. See the README notes.
set -euo pipefail

PROFILE_DIR="${1:-bot-profile-basic/current}"
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
echo "Upload it to private object storage and set its signed GET URL as BOT_PROFILE_URL in Railway."
if [ "$BYTES" -gt 512000 ]; then
  echo "NOTE: >512KB — use object storage instead of an environment variable."
fi
