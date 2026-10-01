import * as fs from "node:fs";
import * as path from "node:path";
import logger from "./logger.service.js";

const CHROME_LOCK_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
const VOLUME_SYSTEM_ENTRIES = new Set(["lost+found"]);
const NEXT_PROFILE_DIRNAME = ".next";
const PREVIOUS_PROFILE_DIRNAME = ".previous";

// Profile reads and write-backs must never overlap. All workers live in this
// process (Railway is configured with one replica), so an in-process mutex is
// sufficient and avoids partially copied profiles during concurrent meetings.
let profileOperationTail: Promise<void> = Promise.resolve();

async function withProfileLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = profileOperationTail;
  let release!: () => void;
  profileOperationTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function removeChromeLocks(profileDir: string): Promise<void> {
  for (const file of CHROME_LOCK_FILES) {
    await fs.promises.rm(path.join(profileDir, file), { force: true }).catch(() => undefined);
  }
}

async function recoverInterruptedSwap(seedDir: string): Promise<void> {
  const volumeDir = path.dirname(seedDir);
  const nextDir = path.join(volumeDir, NEXT_PROFILE_DIRNAME);
  const previousDir = path.join(volumeDir, PREVIOUS_PROFILE_DIRNAME);

  if (!fs.existsSync(seedDir) && fs.existsSync(previousDir)) {
    logger.warn("[Profile] Recovering canonical profile from an interrupted write-back.");
    await fs.promises.rename(previousDir, seedDir);
  }

  if (fs.existsSync(seedDir)) {
    await fs.promises.rm(nextDir, { recursive: true, force: true });
    await fs.promises.rm(previousDir, { recursive: true, force: true });
  }
}

/**
 * Make an isolated working copy of the seeded bot profile. Chrome locks a
 * user-data directory, so concurrent workers must never open the seed itself.
 */
export async function prepareWorkerProfile(seedDir: string, workerDir: string): Promise<void> {
  await withProfileLock(async () => {
    await recoverInterruptedSwap(seedDir);
    await fs.promises.rm(workerDir, { recursive: true, force: true });
    await fs.promises.mkdir(path.dirname(workerDir), { recursive: true });

    if (!fs.existsSync(seedDir)) {
      throw new Error(`Seeded bot profile does not exist at ${seedDir}`);
    }

    logger.info(`[Profile] Replicating canonical profile into ${workerDir}`);
    const seedRoot = path.resolve(seedDir);
    await fs.promises.cp(seedRoot, workerDir, {
      recursive: true,
      filter: (source) => {
        const relativePath = path.relative(seedRoot, path.resolve(source));
        const topLevelEntry = relativePath.split(path.sep)[0];
        return topLevelEntry === undefined || !VOLUME_SYSTEM_ENTRIES.has(topLevelEntry);
      },
    });
    await removeChromeLocks(workerDir);
  });
}

/**
 * Promote a successfully used, closed worker profile to the canonical volume
 * profile. Copying happens in a staging directory and the final directory swap
 * is serialized, so new workers see either the old or the complete new state.
 */
export async function persistWorkerProfile(seedDir: string, workerDir: string): Promise<void> {
  await withProfileLock(async () => {
    if (!fs.existsSync(workerDir)) {
      throw new Error(`Worker profile does not exist at ${workerDir}`);
    }

    await recoverInterruptedSwap(seedDir);
    const volumeDir = path.dirname(seedDir);
    const nextDir = path.join(volumeDir, NEXT_PROFILE_DIRNAME);
    const previousDir = path.join(volumeDir, PREVIOUS_PROFILE_DIRNAME);

    await fs.promises.mkdir(volumeDir, { recursive: true });
    await fs.promises.rm(nextDir, { recursive: true, force: true });
    await fs.promises.cp(workerDir, nextDir, { recursive: true });
    await removeChromeLocks(nextDir);

    await fs.promises.rm(previousDir, { recursive: true, force: true });
    let movedCurrent = false;
    try {
      if (fs.existsSync(seedDir)) {
        await fs.promises.rename(seedDir, previousDir);
        movedCurrent = true;
      }
      await fs.promises.rename(nextDir, seedDir);
    } catch (error) {
      if (!fs.existsSync(seedDir) && movedCurrent && fs.existsSync(previousDir)) {
        await fs.promises.rename(previousDir, seedDir).catch(() => undefined);
      }
      throw error;
    }

    await fs.promises.rm(previousDir, { recursive: true, force: true }).catch((error: unknown) => {
      logger.warn(`[Profile] Could not remove previous profile snapshot: ${(error as Error).message}`);
    });
    logger.info("[Profile] Persisted refreshed worker profile to the canonical volume.");
  });
}

export async function removeWorkerProfile(workerDir: string): Promise<void> {
  await fs.promises.rm(workerDir, { recursive: true, force: true });
}
