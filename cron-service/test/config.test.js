import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../src/config.js";

test("calendar account differs from bot profile account", () => {
  assert.throws(() => readConfig({
    CALENDAR_ACCOUNT_EMAIL: "bot@example.com",
    BOT_PROFILE_ACCOUNT_EMAIL: "BOT@example.com",
    GOOGLE_CALENDAR_ID: "bot@example.com",
    GOOGLE_CALENDAR_CLIENT_ID: "client",
    GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
    GOOGLE_CALENDAR_REFRESH_TOKEN: "token",
  }), /must differ/);
});
