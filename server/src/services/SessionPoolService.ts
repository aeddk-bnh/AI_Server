import type { SessionPoolConfig } from "../config/session-pool";
import type { RequestContext } from "../domain/RequestContext";
import type { SessionLease } from "../domain/SessionLease";
import type { AppLogger } from "../telemetry/Logger";
import type {
  ChatBackendSessionAdapter,
  SessionPoolStats,
} from "../types/internal";
import { AppError } from "../utils/AppError";
import { SessionFactory } from "./SessionFactory";

type PoolEntryState =
  | "empty"
  | "starting"
  | "idle"
  | "busy"
  | "broken"
  | "recycling";

interface PoolEntry {
  sessionId: string;
  state: PoolEntryState;
  adapter?: ChatBackendSessionAdapter;
  createPromise?: Promise<void>;
  lastError?: string;
}

interface PendingAcquire {
  active: boolean;
  timer: NodeJS.Timeout;
  resolve(lease: SessionLease): void;
  reject(error: unknown): void;
}

export class SessionPoolService {
  private readonly entries: PoolEntry[];
  private readonly waiters: PendingAcquire[] = [];

  constructor(
    private readonly config: SessionPoolConfig,
    private readonly factory: SessionFactory,
    private readonly logger: AppLogger,
  ) {
    this.entries = Array.from({ length: config.size }, (_, index) => ({
      sessionId: `session-${index + 1}`,
      state: "empty",
    }));
  }

  async warmup(): Promise<void> {
    const targets = this.entries.slice(0, this.config.warmupSize);
    await Promise.allSettled(targets.map((entry) => this.ensureEntryReady(entry)));
    this.flushWaiters();
  }

  async acquire(_requestContext: RequestContext): Promise<SessionLease> {
    const idleEntry = this.findIdleEntry();
    if (idleEntry) {
      return this.createLease(idleEntry);
    }

    const emptyEntry = this.entries.find((entry) => entry.state === "empty");
    if (emptyEntry) {
      void this.ensureEntryReady(emptyEntry);
    }

    return new Promise<SessionLease>((resolve, reject) => {
      const waiter: PendingAcquire = {
        active: true,
        timer: setTimeout(() => {
          waiter.active = false;
          this.removeWaiter(waiter);
          reject(
            new AppError("Timed out while waiting for an available session", {
              code: "SESSION_ACQUIRE_TIMEOUT",
              statusCode: 503,
              type: "server_error",
            }),
          );
        }, this.config.acquireTimeoutMs),
        resolve,
        reject,
      };

      this.waiters.push(waiter);
      this.flushWaiters();
    });
  }

  getStats(): SessionPoolStats {
    return {
      size: this.entries.length,
      idle: this.entries.filter((entry) => entry.state === "idle").length,
      busy: this.entries.filter((entry) => entry.state === "busy").length,
      starting: this.entries.filter((entry) => entry.state === "starting").length,
      broken: this.entries.filter((entry) => entry.state === "broken").length,
      recycling: this.entries.filter((entry) => entry.state === "recycling").length,
      queued: this.waiters.filter((waiter) => waiter.active).length,
    };
  }

  async shutdown(): Promise<void> {
    for (const waiter of this.waiters.splice(0)) {
      if (!waiter.active) {
        continue;
      }

      waiter.active = false;
      clearTimeout(waiter.timer);
      waiter.reject(
        new AppError("Session pool is shutting down", {
          code: "SESSION_POOL_SHUTDOWN",
          statusCode: 503,
          type: "server_error",
        }),
      );
    }

    await Promise.allSettled(
      this.entries.map(async (entry) => {
        if (entry.adapter) {
          await entry.adapter.close();
        }

        entry.adapter = undefined;
        entry.state = "empty";
      }),
    );
  }

  private async ensureEntryReady(entry: PoolEntry): Promise<void> {
    if (entry.createPromise) {
      return entry.createPromise;
    }

    if (entry.state === "idle" || entry.state === "busy") {
      return;
    }

    entry.createPromise = (async () => {
      entry.state = "starting";

      try {
        entry.adapter = await this.factory.create(entry.sessionId);
        entry.state = "idle";
        entry.lastError = undefined;
        this.logger.info("session_ready", {
          sessionId: entry.sessionId,
        });
      } catch (error) {
        entry.adapter = undefined;
        entry.state = "broken";
        entry.lastError = error instanceof Error ? error.message : String(error);
        this.logger.error("session_start_failed", {
          sessionId: entry.sessionId,
          error: entry.lastError,
        });
      } finally {
        entry.createPromise = undefined;
        this.flushWaiters();
      }
    })();

    await entry.createPromise;
  }

  private createLease(entry: PoolEntry): SessionLease {
    if (!entry.adapter) {
      throw new Error(`Session ${entry.sessionId} has no adapter`);
    }

    entry.state = "busy";
    let finalized = false;

    return {
      sessionId: entry.sessionId,
      adapter: entry.adapter,
      release: async () => {
        if (finalized) {
          return;
        }

        finalized = true;
        entry.state = "idle";
        this.flushWaiters();
      },
      markBroken: async (reason: string) => {
        if (finalized) {
          return;
        }

        finalized = true;
        await this.recycleEntry(entry, reason);
      },
    };
  }

  private async recycleEntry(entry: PoolEntry, reason: string): Promise<void> {
    entry.state = "recycling";
    entry.lastError = reason;

    const previousAdapter = entry.adapter;
    entry.adapter = undefined;

    try {
      if (previousAdapter) {
        await previousAdapter.close();
      }
    } catch (error) {
      this.logger.warn("session_close_failed", {
        sessionId: entry.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      entry.adapter = await this.factory.create(entry.sessionId);
      entry.state = "idle";
      entry.lastError = undefined;
      this.logger.info("session_recycled", {
        sessionId: entry.sessionId,
      });
    } catch (error) {
      entry.state = "broken";
      entry.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error("session_recycle_failed", {
        sessionId: entry.sessionId,
        error: entry.lastError,
      });
    } finally {
      this.flushWaiters();
    }
  }

  private flushWaiters(): void {
    while (true) {
      const waiter = this.waiters.find((candidate) => candidate.active);
      const idleEntry = this.findIdleEntry();

      if (!waiter) {
        return;
      }

      if (!idleEntry) {
        const emptyEntry = this.entries.find((entry) => entry.state === "empty");
        if (emptyEntry) {
          void this.ensureEntryReady(emptyEntry);
        }

        return;
      }

      waiter.active = false;
      clearTimeout(waiter.timer);
      this.removeWaiter(waiter);
      waiter.resolve(this.createLease(idleEntry));
    }
  }

  private findIdleEntry(): PoolEntry | undefined {
    return this.entries.find((entry) => entry.state === "idle" && entry.adapter);
  }

  private removeWaiter(waiter: PendingAcquire): void {
    const index = this.waiters.indexOf(waiter);
    if (index >= 0) {
      this.waiters.splice(index, 1);
    }
  }
}
