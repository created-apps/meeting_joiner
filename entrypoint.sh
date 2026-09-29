#!/bin/bash

# ---------------------------------------------------------------------------
# Seed the bot's authenticated Chrome profile (one-time, on first boot).
#
# The bot must join Google Meet as a signed-in account. We can't sign in inside
# the container, so a profile archive is fetched from private Cloudflare R2 as
# a base64-encoded gzipped tarball of `bot-profile-basic/`.
#
# Prefer BOT_PROFILE_URL with a temporary signed R2 GET URL. A local seed file
# or BOT_PROFILE_B64 remains available as a fallback.
#
# Seeding runs only when the profile volume has not been seeded yet, so a
# session that Google refreshes on the persistent volume is never clobbered.
# Set BOT_PROFILE_FORCE_SEED=true to re-seed after updating the secret.
# ---------------------------------------------------------------------------
PROFILE_DIR="/app/bot-profile-basic"
SEED_MARKER="$PROFILE_DIR/.seeded"

# Reads base64 text on stdin, extracts the profile tarball into PROFILE_DIR.
seed_profile() {
  echo "[entrypoint] Seeding bot profile into $PROFILE_DIR ..."
  mkdir -p "$PROFILE_DIR"
  # Clear any prior (e.g. anonymous) profile contents before extracting.
  rm -rf "${PROFILE_DIR:?}/"* "${PROFILE_DIR:?}/".[!.]* 2>/dev/null || true
  if base64 -d | tar xzf - -C "$PROFILE_DIR"; then
    touch "$SEED_MARKER"
    echo "[entrypoint] Bot profile seeded successfully."
  else
    echo "[entrypoint] ERROR: Failed to extract profile seed. Bot may be anonymous." >&2
  fi
}

if [ ! -f "$SEED_MARKER" ] || [ "${BOT_PROFILE_FORCE_SEED:-false}" = "true" ]; then
  if [ -n "${BOT_PROFILE_URL:-}" ]; then
    # Railway has no secret-file mount, and the b64 seed is too large for an env
    # var, so fetch it from a private URL (e.g. a signed object-storage link).
    echo "[entrypoint] Fetching bot profile seed from BOT_PROFILE_URL ..."
    curl -fsSL "$BOT_PROFILE_URL" | seed_profile
  elif [ -n "${BOT_PROFILE_SEED_FILE:-}" ] && [ -f "$BOT_PROFILE_SEED_FILE" ]; then
    cat "$BOT_PROFILE_SEED_FILE" | seed_profile
  elif [ -n "${BOT_PROFILE_B64:-}" ]; then
    printf %s "$BOT_PROFILE_B64" | seed_profile
  else
    echo "[entrypoint] WARNING: No profile seed provided (set BOT_PROFILE_URL, BOT_PROFILE_SEED_FILE, or BOT_PROFILE_B64). Bot will join anonymously and most meetings will reject it." >&2
  fi
else
  echo "[entrypoint] Bot profile already seeded; leaving existing session intact."
fi

# Ensure the X11 socket and replicated worker-profile directories exist.
mkdir -p /tmp/.X11-unix 2>/dev/null || true
chmod 1777 /tmp/.X11-unix 2>/dev/null || true
mkdir -p /app/profiles 2>/dev/null || true

# Start dbus for Chrome.
export $(dbus-launch)

# Run the concurrent join/leave worker on :3000.
exec npm run start
