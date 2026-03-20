import type { FastifyInstance } from "fastify";

import type { AppLogger } from "../telemetry/Logger";
import { SessionPoolService } from "../services/SessionPoolService";

export function registerGracefulShutdown(
  app: FastifyInstance,
  sessionPool: SessionPoolService,
  logger: AppLogger,
): void {
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info("shutdown_started", { signal });

    try {
      await app.close();
      await sessionPool.shutdown();
      logger.info("shutdown_completed", { signal });
      process.exit(0);
    } catch (error) {
      logger.error("shutdown_failed", {
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }
}
