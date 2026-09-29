import cron from "node-cron";
import { currentMinuteWindow, getMeetingsStartingThisMinute } from "./calendar.js";
import { dispatchMeeting } from "./worker-client.js";

export class MeetingCron {
  #task = null;
  #running = false;
  #lastWindow = null;

  constructor({ calendar, calendarId, workerUrl, logger = console }) {
    this.calendar = calendar;
    this.calendarId = calendarId;
    this.workerUrl = workerUrl;
    this.logger = logger;
  }

  start() {
    void this.run();
    this.#task = cron.schedule("* * * * *", () => void this.run());
  }

  stop() {
    this.#task?.destroy();
    this.#task = null;
  }

  async run(now = Date.now()) {
    const windowKey = currentMinuteWindow(now).key;
    if (this.#running || this.#lastWindow === windowKey) return;
    this.#running = true;
    try {
      const meetings = await getMeetingsStartingThisMinute(this.calendar, this.calendarId, now);
      this.#lastWindow = windowKey;
      this.logger.info(`[Cron] ${meetings.length} meeting(s) start in ${windowKey}`);
      const results = await Promise.allSettled(
        meetings.map((meeting) => dispatchMeeting(this.workerUrl, meeting.meetLink))
      );
      results.forEach((result, index) => {
        const meeting = meetings[index];
        if (result.status === "fulfilled") {
          this.logger.info(`[Cron] Dispatched ${meeting.eventId}; worker HTTP ${result.value.statusCode}`);
        } else {
          this.logger.error(`[Cron] Failed to dispatch ${meeting.eventId}: ${result.reason}`);
        }
      });
    } catch (error) {
      this.logger.error(`[Cron] Poll failed: ${error.stack || error}`);
    } finally {
      this.#running = false;
    }
  }
}
