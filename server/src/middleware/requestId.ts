import type { FastifyInstance } from "fastify";

import { generateRequestId } from "../utils/ids";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
    startTimeMs: number;
    apiKeyId?: string;
  }
}

export function registerRequestId(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    request.requestId = readHeaderValue(request.headers["x-request-id"]) ?? generateRequestId();
    request.startTimeMs = Date.now();
    reply.header("x-request-id", request.requestId);
  });
}

function readHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => entry.trim());
    return first?.trim();
  }

  return undefined;
}
