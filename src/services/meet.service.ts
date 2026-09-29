import { chromium, type BrowserContext, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import getParticipants from "./participants.service.js";
import logger from "./logger.service.js";
import {
  ARTIFACTS_DIR,
  LEAVE_GRACE_PERIOD_MS,
  MIN_PARTICIPANTS,
  PARTICIPANTS_REFRESH_TIME,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type MeetingSlot,
} from "./meeting.config.js";

async function clickJoin(page: Page): Promise<boolean> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const button = page
      .getByRole("button", { name: /ask to join|join now|join anyway|^\s*join\s*$/i })
      .or(page.locator('button:has-text("Ask to join"), button:has-text("Join now")'))
      .first();

    if (!(await button.isVisible({ timeout: 3_000 }).catch(() => false))) continue;

    const disabled = await button
      .evaluate(
        (element) =>
          (element as HTMLButtonElement).disabled ||
          element.getAttribute("aria-disabled") === "true"
      )
      .catch(() => false);
    if (disabled) {
      await page.waitForTimeout(1_000);
      continue;
    }

    if (await button.click().then(() => true).catch(() => false)) return true;
  }

  return false;
}

async function leaveMeeting(page: Page): Promise<void> {
  const leaveButton = page.getByLabel("Leave call").first();
  if (await leaveButton.isVisible().catch(() => false)) {
    await leaveButton.click().catch(() => undefined);
    await page.waitForTimeout(500);
  }
}

async function closeContext(context: BrowserContext | null): Promise<void> {
  if (!context) return;
  await context.close().catch((error: unknown) => {
    logger.warn(`[Meet] Browser context cleanup failed: ${(error as Error).message}`);
  });
}

/** Join one Google Meet, wait through the grace period, then leave below two. */
export default async function joinMeeting(
  meetingUrl: string,
  meetingId: string,
  slot: MeetingSlot
): Promise<void> {
  const chromeLaunch = process.env.CHROME_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
    : { channel: "chrome" as const };

  const args = [
    "--lang=en-US",
    "--disable-blink-features=AutomationControlled",
    "--window-position=0,0",
    `--window-size=${SCREEN_WIDTH},${SCREEN_HEIGHT}`,
    "--start-maximized",
  ];
  if (process.platform !== "darwin" && process.platform !== "win32") {
    args.push("--ozone-platform=x11");
  }

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    logger.info(`[Meet] Opening ${meetingId} on worker slot ${slot.id}.`);
    context = await chromium.launchPersistentContext(slot.profileDir, {
      ...chromeLaunch,
      headless: false,
      locale: "en-US",
      args,
      ignoreDefaultArgs: ["--enable-automation"],
      permissions: ["microphone", "camera"],
      env:
        process.platform === "linux"
          ? { ...process.env, DISPLAY: slot.display }
          : { ...process.env },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });

    page = context.pages()[0] ?? (await context.newPage());
    await page.goto(meetingUrl, { waitUntil: "domcontentloaded" });

    if (page.url().includes("accounts.google.com")) {
      throw new Error('Bot profile is signed out; run "npm run login" before starting the service.');
    }

    const blocked = page.getByText("You can't join this video call", { exact: false });
    if (await blocked.isVisible({ timeout: 3_000 }).catch(() => false)) {
      throw new Error("Google Meet rejected the bot account for this call.");
    }

    await page
      .getByRole("button", { name: /Dismiss|Continue without|Got it|Close/i })
      .click({ timeout: 2_000 })
      .catch(() => undefined);
    await page.getByLabel("Turn off microphone").click({ timeout: 1_000 }).catch(() => undefined);
    await page.getByLabel("Turn off camera").click({ timeout: 1_000 }).catch(() => undefined);

    const nameInput = page
      .locator(
        'input[type="text"], input[placeholder*="name" i], input[aria-label*="name" i], [role="textbox"]'
      )
      .first();
    if (await nameInput.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await nameInput.fill(process.env.BOT_DISPLAY_NAME || "squirrel");
    }

    if (!(await clickJoin(page))) {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
      const screenshot = path.join(ARTIFACTS_DIR, `join-failure-${meetingId}-${Date.now()}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
      throw new Error(`Join button did not become clickable; screenshot: ${screenshot}`);
    }

    // "Ask to join" can leave the bot in the waiting room. Start the grace
    // period only once Meet exposes its in-call controls and admission is
    // therefore confirmed.
    await page.getByLabel("Leave call").first().waitFor({ state: "visible", timeout: 0 });

    const leaveChecksStartAt = Date.now() + LEAVE_GRACE_PERIOD_MS;
    logger.info(
      `[Meet] Joined ${meetingId}; participant-based leaving starts in ${Math.ceil(
        LEAVE_GRACE_PERIOD_MS / 60_000
      )} minute(s).`
    );

    while (!page.isClosed() && Date.now() < leaveChecksStartAt) {
      const remaining = leaveChecksStartAt - Date.now();
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(PARTICIPANTS_REFRESH_TIME, remaining))
      );
    }

    if (!page.isClosed()) {
      logger.info(`[Meet] ${meetingId} grace period ended; participant-based leaving is active.`);
    }

    while (!page.isClosed()) {
      const participants = await getParticipants(page);
      logger.info(`[Meet] ${meetingId} participant count: ${participants.length}`);

      if (participants.length < MIN_PARTICIPANTS) {
        logger.info(
          `[Meet] ${meetingId} has fewer than ${MIN_PARTICIPANTS} participants after the grace period; leaving.`
        );
        break;
      }

      await page.waitForTimeout(PARTICIPANTS_REFRESH_TIME);
    }
  } finally {
    if (page && !page.isClosed()) await leaveMeeting(page).catch(() => undefined);
    await closeContext(context);
  }
}
