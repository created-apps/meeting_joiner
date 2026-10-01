import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  persistWorkerProfile,
  prepareWorkerProfile,
} from "./profile.service.js";

test("a refreshed worker profile atomically replaces the canonical profile", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "profile-persist-"));
  const seedDir = path.join(root, "volume", "current");
  const workerDir = path.join(root, "workers", "slot-1");

  try {
    await fs.promises.mkdir(path.join(seedDir, "Default"), { recursive: true });
    await fs.promises.writeFile(path.join(seedDir, "Default", "Cookies"), "old-session");
    await fs.promises.writeFile(path.join(seedDir, "SingletonLock"), "stale-lock");

    await prepareWorkerProfile(seedDir, workerDir);
    assert.equal(fs.existsSync(path.join(workerDir, "SingletonLock")), false);
    await fs.promises.writeFile(path.join(workerDir, "Default", "Cookies"), "refreshed-session");
    await fs.promises.writeFile(path.join(workerDir, "SingletonSocket"), "worker-lock");

    await persistWorkerProfile(seedDir, workerDir);

    assert.equal(
      await fs.promises.readFile(path.join(seedDir, "Default", "Cookies"), "utf8"),
      "refreshed-session"
    );
    assert.equal(fs.existsSync(path.join(seedDir, "SingletonSocket")), false);
    assert.equal(fs.existsSync(path.join(root, "volume", ".next")), false);
    assert.equal(fs.existsSync(path.join(root, "volume", ".previous")), false);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("an interrupted swap is recovered before the next worker copy", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "profile-recover-"));
  const volumeDir = path.join(root, "volume");
  const seedDir = path.join(volumeDir, "current");
  const previousDir = path.join(volumeDir, ".previous");
  const workerDir = path.join(root, "workers", "slot-1");

  try {
    await fs.promises.mkdir(path.join(previousDir, "Default"), { recursive: true });
    await fs.promises.writeFile(path.join(previousDir, "Default", "Cookies"), "recover-me");

    await prepareWorkerProfile(seedDir, workerDir);

    assert.equal(
      await fs.promises.readFile(path.join(workerDir, "Default", "Cookies"), "utf8"),
      "recover-me"
    );
    assert.equal(fs.existsSync(previousDir), false);
    assert.equal(fs.existsSync(seedDir), true);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
