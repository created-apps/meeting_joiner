import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import logger from "./logger.service.js";
import { SCREEN_DEPTH, SCREEN_HEIGHT, SCREEN_WIDTH } from "./meeting.config.js";

/** Owns the virtual display used by the non-headless Meet browser. */
export class XvfbDisplay {
  private proc: ChildProcess | null = null;
  private stopping = false;
  private readonly displayNum: string;

  constructor(private readonly display: string) {
    this.displayNum = display.replace(/^:/, "").split(".")[0] || "";
  }

  private get lockFile(): string {
    return `/tmp/.X${this.displayNum}-lock`;
  }

  private get socketFile(): string {
    return `/tmp/.X11-unix/X${this.displayNum}`;
  }

  async start(timeoutMs = 15_000): Promise<void> {
    if (fs.existsSync(this.lockFile) && !fs.existsSync(this.socketFile)) {
      fs.rmSync(this.lockFile, { force: true });
    }

    const args = [
      this.display,
      "-screen",
      "0",
      `${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH}`,
      "-nolisten",
      "tcp",
      "-ac",
    ];

    logger.info(`[Display] Starting Xvfb on ${this.display}`);
    this.stopping = false;
    this.proc = spawn("Xvfb", args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    let exited = false;
    this.proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    this.proc.once("exit", (code, signal) => {
      exited = true;
      if (!this.stopping) {
        logger.error(
          `[Display] Xvfb on ${this.display} exited unexpectedly (code=${code}, signal=${signal}): ${stderr.trim()}`
        );
      }
    });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (exited) {
        throw new Error(`Xvfb failed to start on ${this.display}: ${stderr.trim()}`);
      }
      if (fs.existsSync(this.socketFile)) {
        const probe = spawnSync("xdpyinfo", ["-display", this.display], {
          env: { ...process.env, DISPLAY: this.display },
          stdio: "ignore",
          timeout: 1_000,
        });
        if (probe.status === 0) {
          logger.info(`[Display] Xvfb on ${this.display} is ready.`);
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    await this.stop();
    throw new Error(`Timed out starting Xvfb on ${this.display}`);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.proc && this.proc.exitCode === null && this.proc.signalCode === null) {
      this.proc.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (this.proc.exitCode === null && this.proc.signalCode === null) {
        this.proc.kill("SIGKILL");
      }
    }
    this.proc = null;

    for (const file of [this.lockFile, this.socketFile]) {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        // Best-effort cleanup after Xvfb has exited.
      }
    }
  }
}
