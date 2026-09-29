import { chromium } from "playwright";
import * as fs from "node:fs";
import {
  BOT_AUTH_STATE_FILE,
  BOT_PROFILE_DIR,
} from "./services/meeting.config.js";
import logger from "./services/logger.service.js";

/**
 * One-time interactive login for the bot's browser profile.
 *
 * Google blocks scripted sign-in, so this opens a real Chrome window using the
 * SAME persistent profile the bot joins meetings with (`bot-profile-basic`).
 * Sign in to the bot's Google account by hand, then press Enter in the terminal.
 * The authenticated session is exported as portable Playwright storage state.
 * Unlike Chrome's profile cookies, this file can be imported on Railway Linux
 * after being generated on macOS or Windows.
 *
 * Run with:  npm run login
 */
async function login() {
  fs.mkdirSync(BOT_PROFILE_DIR, { recursive: true });
  logger.info(`[Login] Opening Chrome with bot profile: ${BOT_PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(BOT_PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    locale: "en-US",
    args: ["--lang=en-US", "--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  let contextClosed = false;
  context.once("close", () => {
    contextClosed = true;
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://accounts.google.com/");

  logger.info(
    "[Login] Sign in completely, keep Chrome open, then return here and press Enter. The script will export authentication and close Chrome."
  );

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  if (contextClosed) {
    throw new Error(
      "Chrome was closed before authentication could be exported. Run the command again and leave Chrome open until the script closes it."
    );
  }

  const state = await context.storageState({ indexedDB: true });
  const hasGoogleSession = state.cookies.some(
    ({ domain, name }) =>
      /(^|\.)google\.com$/.test(domain) &&
      /^(SID|SAPISID|__Secure-[13]PSID)$/.test(name)
  );
  if (!hasGoogleSession) {
    throw new Error(
      "No authenticated Google session was found. Sign in completely before pressing Enter."
    );
  }

  await context.storageState({ path: BOT_AUTH_STATE_FILE, indexedDB: true });
  await context.close();
  logger.info(`[Login] Portable authentication exported to ${BOT_AUTH_STATE_FILE}.`);
  process.exit(0);
}

login().catch((err) => {
  logger.error(`[Login] Failed: ${(err as Error).stack || err}`);
  process.exit(1);
});
