# Calendar cron service

This separate Node.js process reads Google Calendar every minute and dispatches
events whose current start timestamp falls within that minute to MOM Service B:

```json
{ "meet_link": "https://meet.google.com/abc-defg-hij" }
```

There is no Supabase or local meeting database. Cancelled events are ignored,
and rescheduled events are dispatched only when their new start minute arrives.
Copy `.env.example` to `.env`, provide Calendar OAuth credentials for an account
different from the bot-profile account, then run `npm start`.
