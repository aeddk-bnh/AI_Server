import type { FastifyInstance } from "fastify";

import { OpenAIErrorMapper } from "../adapters/OpenAIErrorMapper";
import type { AppLogger } from "../telemetry/Logger";

export function registerErrorHandler(
  app: FastifyInstance,
  errorMapper: OpenAIErrorMapper,
  logger: AppLogger,
): void {
  app.setErrorHandler((error, request, reply) => {
    const mapped = errorMapper.map(error);
    const message = error instanceof Error ? error.message : String(error);

    logger.error("http_request_failed", {
      requestId: request.requestId,
      method: request.method,
      path: request.url,
      statusCode: mapped.statusCode,
      message,
    });

    reply.code(mapped.statusCode).send(mapped.body);
  });
}
