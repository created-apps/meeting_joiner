import * as path from "node:path";

export const ROOT_DIR = process.cwd();
export const BOT_PROFILE_DIR = path.join(ROOT_DIR, "bot-profile-basic");
export const WORKER_PROFILES_DIR = path.join(ROOT_DIR, "profiles");
export const ARTIFACTS_DIR = path.join(ROOT_DIR, "artifacts");

export const DISPLAY_BASE = Number(process.env.DISPLAY_BASE || 101);
export const SCREEN_WIDTH = Number(process.env.SCREEN_WIDTH || 1280);
export const SCREEN_HEIGHT = Number(process.env.SCREEN_HEIGHT || 720);
export const SCREEN_DEPTH = 24;

export const MAX_CONCURRENT_MEETINGS = Math.max(
  1,
  Number(process.env.MAX_CONCURRENT_MEETINGS || 1)
);

export const MAX_QUEUED_MEETINGS = Math.max(
  0,
  Number(process.env.MAX_QUEUED_MEETINGS || 10)
);

export const PARTICIPANTS_REFRESH_TIME = Math.max(
  1_000,
  Number(process.env.PARTICIPANTS_REFRESH_TIME || 5_000)
);

export const MIN_PARTICIPANTS = 2;

export interface MeetingSlot {
  id: number;
  display: string;
  profileDir: string;
}
