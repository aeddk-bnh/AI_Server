import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { ChatCompletionsController } from "../controllers/ChatCompletionsController";

export function registerChatCompletionsRoutes(
  app: FastifyInstance,
  controller: ChatCompletionsController,
  authPreHandler: preHandlerHookHandler,
): void {
  app.post(
    "/v1/chat/completions",
    {
      preHandler: authPreHandler,
    },
    controller.create,
  );
}
