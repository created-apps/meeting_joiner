#!/bin/bash

# ---------------------------------------------------------------------------
# Seed the bot's authenticated Chrome profile (one-time, on first boot).
#
# The bot must join Google Meet as a signed-in account. We can't sign in inside
# the container, so a profile archive is fetched from private object storage
# (such as Supabase Storage or Cloudflare R2) as a base64-encoded tarball.
#
# Prefer BOT_PROFILE_URL with a temporary signed GET URL. A local seed file or
# BOT_PROFILE_B64 remains available as a fallback.
#
# Seeding runs only when the profile volume has not been seeded yet, so a
# session that Google refreshes on the persistent volume is never clobbered.
# Set BOT_PROFILE_FORCE_SEED=true to re-seed after updating the secret.
# ---------------------------------------------------------------------------
set -o pipefail

PROFILE_VOLUME_DIR="/app/bot-profile-basic"
PROFILE_DIR="$PROFILE_VOLUME_DIR/current"
NEXT_PROFILE_DIR="$PROFILE_VOLUME_DIR/.next"
PREVIOUS_PROFILE_DIR="$PROFILE_VOLUME_DIR/.previous"
SEED_MARKER="$PROFILE_VOLUME_DIR/.seeded"

# Recover the last complete profile if a container stopped during the narrow
# directory-swap window used by the runtime write-back.
if [ ! -d "$PROFILE_DIR" ] && [ -d "$PREVIOUS_PROFILE_DIR" ]; then
  echo "[entrypoint] Recovering canonical bot profile after an interrupted swap."
  mv "$PREVIOUS_PROFILE_DIR" "$PROFILE_DIR"
fi

# Reads base64 text on stdin, extracts the profile tarball into PROFILE_DIR.
seed_profile() {
  echo "[entrypoint] Seeding bot profile into $PROFILE_DIR ..."
  mkdir -p "$PROFILE_VOLUME_DIR"
  rm -rf "$NEXT_PROFILE_DIR"
  mkdir -p "$NEXT_PROFILE_DIR"
  if base64 -d | tar xzf - -C "$NEXT_PROFILE_DIR"; then
    rm -rf "$PREVIOUS_PROFILE_DIR"
    if [ -d "$PROFILE_DIR" ]; then
      mv "$PROFILE_DIR" "$PREVIOUS_PROFILE_DIR"
    fi
    if ! mv "$NEXT_PROFILE_DIR" "$PROFILE_DIR"; then
      if [ ! -d "$PROFILE_DIR" ] && [ -d "$PREVIOUS_PROFILE_DIR" ]; then
        mv "$PREVIOUS_PROFILE_DIR" "$PROFILE_DIR"
      fi
      echo "[entrypoint] ERROR: Failed to activate the seeded profile." >&2
      return 1
    fi
    rm -rf "$PREVIOUS_PROFILE_DIR"
    touch "$SEED_MARKER"
    echo "[entrypoint] Bot profile seeded successfully."
  else
    rm -rf "$NEXT_PROFILE_DIR"
    echo "[entrypoint] ERROR: Failed to extract profile seed. Bot may be anonymous." >&2
    return 1
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
mkdir -p /app/profiles /app/logs /app/artifacts 2>/dev/null || true

# A fresh Railway volume is root-owned. Keep the filesystem recovery directory
# untouched, but make the mount root and app-owned profile data writable by the
# non-root runtime user that launches Chrome.
if [ "$(id -u)" -eq 0 ]; then
  mkdir -p /tmp/runtime-pwuser
  chown pwuser:pwuser "$PROFILE_VOLUME_DIR" /app/profiles /app/logs /app/artifacts /tmp/runtime-pwuser
  chmod 700 /tmp/runtime-pwuser
  for owned_path in "$PROFILE_DIR" "$NEXT_PROFILE_DIR" "$PREVIOUS_PROFILE_DIR" "$SEED_MARKER"; do
    if [ -e "$owned_path" ] || [ -L "$owned_path" ]; then
      chown -R pwuser:pwuser "$owned_path"
    fi
  done

  exec gosu pwuser env \
    HOME=/home/pwuser \
    USER=pwuser \
    LOGNAME=pwuser \
    XDG_RUNTIME_DIR=/tmp/runtime-pwuser \
    bash -c 'export $(dbus-launch); exec npm run start'
fi

# Non-container/local fallback when the entrypoint already runs without root.
export $(dbus-launch)
exec npm run start
