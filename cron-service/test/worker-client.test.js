import assert from "node:assert/strict";
import test from "node:test";
import { dispatchMeeting } from "../src/worker-client.js";

test("dispatchMeeting sends only meet_link", async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ status: "started" }), { status: 200 });
  };
  await dispatchMeeting("http://worker:3000", "https://meet.google.com/abc-defg-hij", fakeFetch);
  assert.equal(request.url, "http://worker:3000/api/meet/join");
  assert.deepEqual(JSON.parse(request.options.body), {
    meet_link: "https://meet.google.com/abc-defg-hij",
  });
});
