import Fastify, { type FastifyInstance, type preHandlerHookHandler } from "fastify";

import { OpenAIErrorMapper } from "../adapters/OpenAIErrorMapper";
import { ChatCompletionsController } from "../controllers/ChatCompletionsController";
import { HealthController } from "../controllers/HealthController";
import { ModelsController } from "../controllers/ModelsController";
import { registerAccessLog } from "../middleware/accessLog";
import { registerErrorHandler } from "../middleware/errorHandler";
import { registerRequestId } from "../middleware/requestId";
import { registerChatCompletionsRoutes } from "../routes/chatCompletions.routes";
import { registerHealthRoutes } from "../routes/health.routes";
import { registerModelsRoutes } from "../routes/models.routes";
import type { AppLogger } from "../telemetry/Logger";

export interface CreateServerInput {
  logger: AppLogger;
  errorMapper: OpenAIErrorMapper;
  authPreHandler: preHandlerHookHandler;
  healthController: HealthController;
  modelsController: ModelsController;
  chatCompletionsController: ChatCompletionsController;
}

export function createServer(input: CreateServerInput): FastifyInstance {
  const app = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  registerRequestId(app);
  registerAccessLog(app, input.logger);
  registerErrorHandler(app, input.errorMapper, input.logger);

  registerHealthRoutes(app, input.healthController);
  registerModelsRoutes(app, input.modelsController, input.authPreHandler);
  registerChatCompletionsRoutes(
    app,
    input.chatCompletionsController,
    input.authPreHandler,
  );

  return app;
}
