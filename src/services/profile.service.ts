import * as fs from "node:fs";
import * as path from "node:path";
import logger from "./logger.service.js";

const CHROME_LOCK_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

/**
 * Make an isolated working copy of the seeded bot profile. Chrome locks a
 * user-data directory, so concurrent workers must never open the seed itself.
 */
export async function prepareWorkerProfile(seedDir: string, workerDir: string): Promise<void> {
  await fs.promises.rm(workerDir, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(workerDir), { recursive: true });

  if (!fs.existsSync(seedDir)) {
    throw new Error(`Seeded bot profile does not exist at ${seedDir}`);
  }

  logger.info(`[Profile] Replicating bot profile into ${workerDir}`);
  await fs.promises.cp(seedDir, workerDir, { recursive: true });
  for (const file of CHROME_LOCK_FILES) {
    await fs.promises.rm(path.join(workerDir, file), { force: true }).catch(() => undefined);
  }
}

export async function removeWorkerProfile(workerDir: string): Promise<void> {
  await fs.promises.rm(workerDir, { recursive: true, force: true });
}
