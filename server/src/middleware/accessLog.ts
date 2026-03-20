import type { FastifyInstance } from "fastify";

import type { AppLogger } from "../telemetry/Logger";

export function registerAccessLog(
  app: FastifyInstance,
  logger: AppLogger,
): void {
  app.addHook("onResponse", async (request, reply) => {
    logger.info("http_request_completed", {
      requestId: request.requestId,
      method: request.method,
      path: request.url,
      statusCode: reply.statusCode,
      durationMs: Date.now() - request.startTimeMs,
      apiKeyId: request.apiKeyId,
    });
  });
}
