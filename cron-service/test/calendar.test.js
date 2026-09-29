import assert from "node:assert/strict";
import test from "node:test";
import { currentMinuteWindow, selectMeetingsStartingThisMinute } from "../src/calendar.js";

test("currentMinuteWindow rounds to the UTC minute", () => {
  const window = currentMinuteWindow(Date.parse("2026-09-30T10:15:42.123Z"));
  assert.equal(window.key, "2026-09-30T10:15:00.000Z");
  assert.equal(window.end - window.start, 60_000);
});

test("cancelled and rescheduled-away meetings are not selected", () => {
  const now = Date.parse("2026-09-30T10:15:25.000Z");
  const events = [
    { id: "due", status: "confirmed", start: { dateTime: "2026-09-30T10:15:40.000Z" }, hangoutLink: "https://meet.google.com/abc-defg-hij" },
    { id: "rescheduled", status: "confirmed", start: { dateTime: "2026-09-30T10:16:00.000Z" }, hangoutLink: "https://meet.google.com/klm-nopq-rst" },
    { id: "cancelled", status: "cancelled", start: { dateTime: "2026-09-30T10:15:10.000Z" }, hangoutLink: "https://meet.google.com/uvw-xyza-bcd" },
  ];
  assert.deepEqual(
    selectMeetingsStartingThisMinute(events, now).map(({ eventId }) => eventId),
    ["due"]
  );
});
