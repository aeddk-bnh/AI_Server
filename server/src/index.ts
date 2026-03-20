import { OpenAIErrorMapper } from "./adapters/OpenAIErrorMapper";
import { OpenAIResponseTranslator } from "./adapters/OpenAIResponseTranslator";
import { OpenAIStreamTranslator } from "./adapters/OpenAIStreamTranslator";
import { createServer } from "./app/createServer";
import { loadAppConfig } from "./config/env";
import { loadModelAliasConfig } from "./config/model-aliases";
import { buildSessionPoolConfig } from "./config/session-pool";
import { ChatCompletionsController } from "./controllers/ChatCompletionsController";
import { HealthController } from "./controllers/HealthController";
import { ModelsController } from "./controllers/ModelsController";
import { MessageNormalizer } from "./domain/MessageNormalizer";
import { ModelAliasRegistry } from "./domain/ModelAliasRegistry";
import { PromptRenderer } from "./domain/PromptRenderer";
import { createApiKeyAuth } from "./middleware/apiKeyAuth";
import { ChatCompletionService } from "./services/ChatCompletionService";
import { ModelCatalogService } from "./services/ModelCatalogService";
import { SessionFactory } from "./services/SessionFactory";
import { SessionHealthService } from "./services/SessionHealthService";
import { SessionPoolService } from "./services/SessionPoolService";
import { ConsoleLogger } from "./telemetry/Logger";
import { NoopMetricsRecorder } from "./telemetry/Metrics";
import { registerGracefulShutdown } from "./workers/gracefulShutdown";

async function main(): Promise<void> {
  const config = loadAppConfig();
  const logger = new ConsoleLogger(config.server.logLevel);
  const metrics = new NoopMetricsRecorder();

  const modelAliasConfig = await loadModelAliasConfig(
    config.models.aliasConfigPath,
    logger,
  );
  const modelRegistry = new ModelAliasRegistry(modelAliasConfig);
  const errorMapper = new OpenAIErrorMapper();
  const sessionFactory = new SessionFactory(config, logger);
  const sessionPool = new SessionPoolService(
    buildSessionPoolConfig(config),
    sessionFactory,
    logger,
  );

  await sessionPool.warmup();

  const modelCatalogService = new ModelCatalogService(modelRegistry);
  const sessionHealthService = new SessionHealthService(config, sessionPool);
  const chatCompletionService = new ChatCompletionService(
    modelRegistry,
    new MessageNormalizer(),
    new PromptRenderer(),
    sessionPool,
    new OpenAIResponseTranslator(),
    new OpenAIStreamTranslator(),
    errorMapper,
    logger,
    metrics,
    config.session.defaultTimeoutMs,
  );

  const app = createServer({
    logger,
    errorMapper,
    authPreHandler: createApiKeyAuth(config.server.apiKeys),
    healthController: new HealthController(sessionHealthService),
    modelsController: new ModelsController(modelCatalogService),
    chatCompletionsController: new ChatCompletionsController(
      chatCompletionService,
      errorMapper,
    ),
  });

  registerGracefulShutdown(app, sessionPool, logger);

  await app.listen({
    host: config.server.host,
    port: config.server.port,
  });

  logger.info("server_started", {
    host: config.server.host,
    port: config.server.port,
    backendMode: config.backend.mode,
  });
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
