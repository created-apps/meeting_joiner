# MOM meeting services

The repository now contains two independent Node.js services:

1. **MOM Service B** (repository root) is only a concurrent Google Meet
   join/leave worker.
2. **Calendar cron** (`cron-service/`) checks Google Calendar every minute and
   sends meetings that start in the current minute to MOM Service B.

There is no Supabase integration and neither service records meeting media.

## MOM Service B

The worker accepts one field and derives the meeting ID from it:

```http
POST /api/meet/join
Content-Type: application/json

{ "meet_link": "https://meet.google.com/abc-defg-hij" }
```

Each concurrent slot gets a unique Xvfb display and an ephemeral copy of the
single seeded Chrome profile. Chrome never opens the seed profile itself, so
workers do not share profile locks. Overflow requests are queued.

The bot does not apply participant-based leaving during the first 45 minutes
after admission to the call is confirmed. Once that grace period ends, it leaves when the
participant count is below two. `GET /api/meet/status` reports active and queued
meetings; `GET /health` is the deployment health check.

Worker variables are documented in `.env.example`. In particular:

- `MAX_CONCURRENT_MEETINGS=1` allows one active meeting.
- Set `MAX_CONCURRENT_MEETINGS` above `1` to join simultaneous meetings.
- `LEAVE_GRACE_PERIOD_MS=2700000` starts participant-based leaving after 45 minutes.
- `BOT_PROFILE_URL` points to the packed profile seed.
- `BOT_PROFILE_FORCE_SEED=true` refreshes the seed at container startup.

## Calendar cron

The separate service is documented in `cron-service/README.md`. It uses the
Calendar API as the source of truth on every run:

- Cron expression: `* * * * *`
- Only events starting within that exact minute are dispatched.
- Cancelled events are ignored.
- Rescheduled events are dispatched at their new time.
- Multiple simultaneous events are dispatched concurrently; MOM Service B
  starts or queues them according to its configured worker capacity.

The calendar OAuth account must be different from the Chrome bot-profile
account.

## Local checks

```bash
npm install
npm test

cd cron-service
npm install
npm test
```

Run both services with `docker compose up --build` after supplying the worker
profile URL and Calendar OAuth variables.
