import assert from "node:assert/strict";
import test from "node:test";
import { MeetingSessionManager } from "./session-manager.js";

test("worker queues overflow and drains it when a slot is released", async () => {
  const releases: Array<() => void> = [];
  const manager = new MeetingSessionManager(
    async () =>
      new Promise<void>((resolve) => {
        releases.push(resolve);
      })
  );

  const first = manager.requestJoin("abc-defg-hij", "https://meet.google.com/abc-defg-hij");
  const second = manager.requestJoin("klm-nopq-rst", "https://meet.google.com/klm-nopq-rst");

  assert.equal(first.status, "started");
  assert.equal(second.status, "queued");
  assert.equal(manager.status().active, 1);
  assert.equal(manager.status().queued, 1);
  assert.equal(
    manager.requestJoin("abc-defg-hij", "https://meet.google.com/abc-defg-hij").status,
    "duplicate"
  );

  releases[0]!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(manager.status().activeMeetings, ["klm-nopq-rst"]);
  assert.equal(manager.status().queued, 0);

  releases[1]!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.status().active, 0);
});

test("configured worker slots start concurrent meetings", async () => {
  const releases: Array<() => void> = [];
  const manager = new MeetingSessionManager(
    async () =>
      new Promise<void>((resolve) => {
        releases.push(resolve);
      }),
    2,
    10
  );

  assert.equal(
    manager.requestJoin("abc-defg-hij", "https://meet.google.com/abc-defg-hij").status,
    "started"
  );
  assert.equal(
    manager.requestJoin("klm-nopq-rst", "https://meet.google.com/klm-nopq-rst").status,
    "started"
  );
  assert.equal(manager.status().active, 2);
  assert.equal(manager.status().capacity, 2);

  releases.forEach((release) => release());
  await new Promise((resolve) => setImmediate(resolve));
});
