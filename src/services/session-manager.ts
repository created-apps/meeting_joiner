import * as path from "node:path";
import joinMeeting from "./meet.service.js";
import { XvfbDisplay } from "./display.service.js";
import logger from "./logger.service.js";
import {
  BOT_PROFILE_DIR,
  DISPLAY_BASE,
  MAX_CONCURRENT_MEETINGS,
  MAX_QUEUED_MEETINGS,
  WORKER_PROFILES_DIR,
  type MeetingSlot,
} from "./meeting.config.js";
import { prepareWorkerProfile, removeWorkerProfile } from "./profile.service.js";

export type JoinResult =
  | { status: "started"; slotId: number; active: number; capacity: number }
  | { status: "queued"; position: number; active: number; capacity: number }
  | { status: "duplicate" }
  | { status: "rejected"; reason: string; active: number; capacity: number };

interface JoinJob {
  meetingId: string;
  meetLink: string;
}

export type MeetingRunner = (
  slot: MeetingSlot,
  meetingId: string,
  meetLink: string
) => Promise<void>;

async function runMeetingSession(
  slot: MeetingSlot,
  meetingId: string,
  meetLink: string
): Promise<void> {
  const display = process.platform === "linux" ? new XvfbDisplay(slot.display) : null;

  try {
    await prepareWorkerProfile(BOT_PROFILE_DIR, slot.profileDir);
    await display?.start();
    await joinMeeting(meetLink, meetingId, slot);
  } finally {
    await display?.stop().catch((error: unknown) => {
      logger.error(`[Session] Display cleanup failed for slot ${slot.id}: ${(error as Error).message}`);
    });
    await removeWorkerProfile(slot.profileDir).catch((error: unknown) => {
      logger.error(`[Session] Profile cleanup failed for slot ${slot.id}: ${(error as Error).message}`);
    });
  }
}

/** Fixed worker pool with one isolated display and profile copy per slot. */
export class MeetingSessionManager {
  private readonly slots: MeetingSlot[] = [];
  private readonly free: MeetingSlot[] = [];
  private readonly active = new Map<string, MeetingSlot>();
  private readonly queue: JoinJob[] = [];
  private readonly queuedIds = new Set<string>();

  constructor(
    private readonly runner: MeetingRunner = runMeetingSession,
    maxConcurrent = MAX_CONCURRENT_MEETINGS,
    private readonly maxQueued = MAX_QUEUED_MEETINGS
  ) {
    for (let id = 0; id < maxConcurrent; id += 1) {
      const displayNumber = DISPLAY_BASE + id;
      const slot: MeetingSlot = {
        id,
        display: `:${displayNumber}`,
        profileDir: path.join(WORKER_PROFILES_DIR, `slot-${displayNumber}`),
      };
      this.slots.push(slot);
      this.free.push(slot);
    }

    logger.info(
      `[Session] Initialized ${this.slots.length} worker(s); queue capacity ${this.maxQueued}.`
    );
  }

  requestJoin(meetingId: string, meetLink: string): JoinResult {
    if (this.active.has(meetingId) || this.queuedIds.has(meetingId)) {
      return { status: "duplicate" };
    }

    const slot = this.free.pop();
    if (slot) {
      void this.run(slot, { meetingId, meetLink });
      return {
        status: "started",
        slotId: slot.id,
        active: this.active.size,
        capacity: this.slots.length,
      };
    }

    if (this.queue.length >= this.maxQueued) {
      return {
        status: "rejected",
        reason: "All meeting workers and queue positions are busy.",
        active: this.active.size,
        capacity: this.slots.length,
      };
    }

    this.queue.push({ meetingId, meetLink });
    this.queuedIds.add(meetingId);
    return {
      status: "queued",
      position: this.queue.length,
      active: this.active.size,
      capacity: this.slots.length,
    };
  }

  private async run(slot: MeetingSlot, job: JoinJob): Promise<void> {
    this.active.set(job.meetingId, slot);
    try {
      await this.runner(slot, job.meetingId, job.meetLink);
    } catch (error) {
      logger.error(`[Session] Meeting ${job.meetingId} failed: ${(error as Error).stack || error}`);
    } finally {
      this.active.delete(job.meetingId);
      this.free.push(slot);
      this.drain();
    }
  }

  private drain(): void {
    while (this.free.length > 0 && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.queuedIds.delete(job.meetingId);
      const slot = this.free.pop()!;
      void this.run(slot, job);
    }
  }

  status() {
    return {
      capacity: this.slots.length,
      active: this.active.size,
      queued: this.queue.length,
      activeMeetings: [...this.active.keys()],
      queuedMeetings: this.queue.map(({ meetingId }) => meetingId),
    };
  }
}

export const sessionManager = new MeetingSessionManager();
export default sessionManager;
