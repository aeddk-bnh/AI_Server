import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { ModelsController } from "../controllers/ModelsController";

export function registerModelsRoutes(
  app: FastifyInstance,
  controller: ModelsController,
  authPreHandler: preHandlerHookHandler,
): void {
  app.get(
    "/v1/models",
    {
      preHandler: authPreHandler,
    },
    controller.listModels,
  );
}
