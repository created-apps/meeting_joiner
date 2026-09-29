import { chromium } from "playwright";
import { BOT_PROFILE_DIR } from "./services/meeting.config.js";
import logger from "./services/logger.service.js";

/**
 * One-time interactive login for the bot's browser profile.
 *
 * Google blocks scripted sign-in, so this opens a real Chrome window using the
 * SAME persistent profile the bot joins meetings with (`bot-profile-basic`).
 * Sign in to the bot's Google account by hand, then press Enter in the terminal.
 * The session is saved into the profile and reused on every future join.
 *
 * Run with:  npm run login
 */
async function login() {
  logger.info(`[Login] Opening Chrome with bot profile: ${BOT_PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(BOT_PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    locale: "en-US",
    args: ["--lang=en-US", "--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://accounts.google.com/");

  logger.info(
    "[Login] Sign in to the bot's Google account in the opened window, then press Enter here to save the session and exit."
  );

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  await context.close();
  logger.info("[Login] Session saved to profile. The bot will now join as this account.");
  process.exit(0);
}

login().catch((err) => {
  logger.error(`[Login] Failed: ${(err as Error).stack || err}`);
  process.exit(1);
});
