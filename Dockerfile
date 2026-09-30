# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Builder: compile TypeScript. Uses a slim Node base and skips Playwright's
# browser download (the app launches the system Google Chrome, not a bundled
# browser), so no ~1.5GB of Chromium/Firefox/WebKit is ever fetched.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS builder
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime: Chrome plus a virtual display for the non-headless Meet browser.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Bump this value to force Railway to rebuild the Chrome layer (no UI cache-clear).
ARG CACHEBUST=2025-07-19

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget gnupg ca-certificates \
    && wget -qO- https://dl.google.com/linux/linux_signing_key.pub \
         | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
         > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        google-chrome-stable \
        xvfb \
        x11-utils \
        dbus \
        dbus-x11 \
        fonts-liberation \
        curl \
    && dbus-uuidgen > /etc/machine-id \
    && apt-get purge -y wget gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for Chrome.
RUN groupadd -r pwuser && useradd -r -g pwuser -G video -m pwuser

WORKDIR /app

# Copy pre-built artifacts owned by the runtime user (no costly recursive chown).
COPY --from=builder --chown=pwuser:pwuser /app/node_modules ./node_modules
COPY --from=builder --chown=pwuser:pwuser /app/dist ./dist
COPY --chown=pwuser:pwuser package*.json entrypoint.sh ./

RUN chmod +x entrypoint.sh \
    && mkdir -p logs artifacts bot-profile-basic profiles \
    && chown pwuser:pwuser logs artifacts bot-profile-basic profiles

# The system apt repo for google-chrome-stable fails on Railway's build infra.
# Use Playwright's own installer instead: downloads Chrome to a managed path
# and installs all required system libraries via --with-deps.
RUN npx playwright install chrome --with-deps

USER pwuser

EXPOSE 3000

# NOTE: No Docker `VOLUME` instruction — Railway rejects it and manages
# persistence via Railway Volumes (configured in the dashboard). The
# directories above are created + owned by pwuser in the RUN step. If you want
# the signed-in Google session to persist across deploys, attach a Railway Volume at
# /app/bot-profile-basic (otherwise it's re-seeded from BOT_PROFILE_URL on boot).

ENTRYPOINT ["/app/entrypoint.sh"]
