import { Router, type Request, type Response } from "express";
import { sessionManager } from "../services/session-manager.js";
import logger from "../services/logger.service.js";

const router = Router();

function parseMeetLink(value: unknown): { meetLink: string; meetingId: string } | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    const meetingId = url.pathname.replace(/^\//, "");
    if (
      url.hostname !== "meet.google.com" ||
      !/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(meetingId)
    ) {
      return null;
    }
    return { meetLink: url.toString(), meetingId };
  } catch {
    return null;
  }
}

router.post("/join", (req: Request, res: Response) => {
  const meeting = parseMeetLink(req.body?.meet_link);
  if (!meeting) {
    return res.status(400).json({
      error: "meet_link must be a valid Google Meet URL",
      example: { meet_link: "https://meet.google.com/abc-defg-hij" },
    });
  }

  logger.info(`[API] Join requested for ${meeting.meetingId}`);
  const result = sessionManager.requestJoin(meeting.meetingId, meeting.meetLink);

  switch (result.status) {
    case "started":
      return res.status(200).json({
        status: result.status,
        meetingId: meeting.meetingId,
        slotId: result.slotId,
        active: result.active,
        capacity: result.capacity,
      });
    case "queued":
      return res.status(202).json({
        status: result.status,
        meetingId: meeting.meetingId,
        queuePosition: result.position,
        active: result.active,
        capacity: result.capacity,
      });
    case "duplicate":
      return res.status(409).json({
        status: result.status,
        meetingId: meeting.meetingId,
      });
    case "rejected":
      return res.status(429).json({
        status: result.status,
        error: result.reason,
        meetingId: meeting.meetingId,
        active: result.active,
        capacity: result.capacity,
      });
  }
});

router.get("/status", (_req: Request, res: Response) => {
  return res.status(200).json(sessionManager.status());
});

export default router;
