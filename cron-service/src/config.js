export function readConfig(env = process.env) {
  const config = {
    calendarAccountEmail: env.CALENDAR_ACCOUNT_EMAIL?.trim() || "",
    botAccountEmail: env.BOT_PROFILE_ACCOUNT_EMAIL?.trim() || "",
    calendarId: env.GOOGLE_CALENDAR_ID?.trim() || env.CALENDAR_ACCOUNT_EMAIL?.trim() || "",
    clientId: env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || "",
    clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || "",
    refreshToken: env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim() || "",
    workerUrl: (env.MOM_SERVICE_B_URL || "http://localhost:3000").replace(/\/$/, ""),
  };

  const required = [
    "calendarAccountEmail",
    "botAccountEmail",
    "calendarId",
    "clientId",
    "clientSecret",
    "refreshToken",
    "workerUrl",
  ];
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) throw new Error(`Missing cron configuration: ${missing.join(", ")}`);

  if (config.calendarAccountEmail.toLowerCase() === config.botAccountEmail.toLowerCase()) {
    throw new Error("CALENDAR_ACCOUNT_EMAIL must differ from BOT_PROFILE_ACCOUNT_EMAIL");
  }
  return config;
}
