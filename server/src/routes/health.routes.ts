import type { FastifyInstance } from "fastify";

import { HealthController } from "../controllers/HealthController";

export function registerHealthRoutes(
  app: FastifyInstance,
  controller: HealthController,
): void {
  app.get("/healthz", controller.healthz);
  app.get("/readyz", controller.readyz);
}
