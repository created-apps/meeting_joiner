import { google } from "googleapis";

export function currentMinuteWindow(now = Date.now()) {
  const start = new Date(now);
  start.setUTCSeconds(0, 0);
  return { start: start.getTime(), end: start.getTime() + 60_000, key: start.toISOString() };
}

export function getMeetLink(event) {
  const candidates = [
    event.hangoutLink,
    ...(event.conferenceData?.entryPoints || [])
      .filter((entry) => entry.entryPointType === "video")
      .map((entry) => entry.uri),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const meetingId = url.pathname.replace(/^\//, "");
      if (
        url.hostname === "meet.google.com" &&
        /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(meetingId)
      ) return url.toString();
    } catch {
      // Ignore malformed conference links.
    }
  }
  return null;
}

export function selectMeetingsStartingThisMinute(events, now = Date.now()) {
  const window = currentMinuteWindow(now);
  const selected = [];
  for (const event of events) {
    if (!event.id || event.status === "cancelled") continue;
    const startValue = event.start?.dateTime;
    if (!startValue) continue;
    const startTime = Date.parse(startValue);
    if (startTime < window.start || startTime >= window.end) continue;
    const meetLink = getMeetLink(event);
    if (meetLink) selected.push({ eventId: event.id, startTime, meetLink });
  }
  return selected.sort((a, b) => a.startTime - b.startTime);
}

export function createCalendarClient(config) {
  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
  auth.setCredentials({ refresh_token: config.refreshToken });
  return google.calendar({ version: "v3", auth });
}

export async function getMeetingsStartingThisMinute(calendar, calendarId, now = Date.now()) {
  const window = currentMinuteWindow(now);
  const response = await calendar.events.list({
    calendarId,
    timeMin: new Date(window.start).toISOString(),
    timeMax: new Date(window.end).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });
  return selectMeetingsStartingThisMinute(response.data.items || [], now);
}
