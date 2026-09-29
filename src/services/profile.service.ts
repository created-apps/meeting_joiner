import * as fs from "node:fs";
import * as path from "node:path";
import logger from "./logger.service.js";

const CHROME_LOCK_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
const VOLUME_SYSTEM_ENTRIES = new Set(["lost+found"]);

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
  const seedRoot = path.resolve(seedDir);
  await fs.promises.cp(seedRoot, workerDir, {
    recursive: true,
    // Railway volumes may contain a root-owned ext filesystem recovery
    // directory. It is not part of Chrome's profile and cannot be read by the
    // non-root browser user.
    filter: (source) => {
      const relativePath = path.relative(seedRoot, path.resolve(source));
      const topLevelEntry = relativePath.split(path.sep)[0];
      return topLevelEntry === undefined || !VOLUME_SYSTEM_ENTRIES.has(topLevelEntry);
    },
  });
  for (const file of CHROME_LOCK_FILES) {
    await fs.promises.rm(path.join(workerDir, file), { force: true }).catch(() => undefined);
  }
}

export async function removeWorkerProfile(workerDir: string): Promise<void> {
  await fs.promises.rm(workerDir, { recursive: true, force: true });
}
