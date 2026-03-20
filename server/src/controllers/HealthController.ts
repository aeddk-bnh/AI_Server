import type { FastifyReply, FastifyRequest } from "fastify";

import { SessionHealthService } from "../services/SessionHealthService";

export class HealthController {
  constructor(private readonly sessionHealthService: SessionHealthService) {}

  healthz = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.send({
      ok: true,
      service: "openai-compatible-ai-server",
    });
  };

  readyz = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const readiness = await this.sessionHealthService.getReadiness();
    reply.code(readiness.ok ? 200 : 503).send(readiness);
  };
}
