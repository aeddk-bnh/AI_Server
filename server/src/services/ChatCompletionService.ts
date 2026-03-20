import type { ChatCompletionRequest, ChatCompletionResponse } from "../types/openai";
import { OpenAIErrorMapper } from "../adapters/OpenAIErrorMapper";
import { OpenAIResponseTranslator } from "../adapters/OpenAIResponseTranslator";
import { OpenAIStreamTranslator } from "../adapters/OpenAIStreamTranslator";
import { MessageNormalizer } from "../domain/MessageNormalizer";
import { ModelAliasRegistry } from "../domain/ModelAliasRegistry";
import { PromptRenderer } from "../domain/PromptRenderer";
import {
  createRequestContext,
  type RequestContext,
} from "../domain/RequestContext";
import type { AppLogger } from "../telemetry/Logger";
import type { MetricsRecorder } from "../telemetry/Metrics";
import { withRequestContext } from "../telemetry/TraceContext";
import { AppError } from "../utils/AppError";
import { generateChatCompletionId } from "../utils/ids";
import { SseWriter } from "../utils/sse";
import { unixTimestampSeconds } from "../utils/time";
import { SessionPoolService } from "./SessionPoolService";

export interface ChatRequestMeta {
  requestId: string;
  apiKeyId?: string;
}

export class ChatCompletionService {
  constructor(
    private readonly modelRegistry: ModelAliasRegistry,
    private readonly messageNormalizer: MessageNormalizer,
    private readonly promptRenderer: PromptRenderer,
    private readonly sessionPool: SessionPoolService,
    private readonly responseTranslator: OpenAIResponseTranslator,
    private readonly streamTranslator: OpenAIStreamTranslator,
    private readonly errorMapper: OpenAIErrorMapper,
    private readonly logger: AppLogger,
    private readonly metrics: MetricsRecorder,
    private readonly defaultTimeoutMs: number,
  ) {}

  async createCompletion(
    request: ChatCompletionRequest,
    meta: ChatRequestMeta,
  ): Promise<ChatCompletionResponse> {
    this.assertSupportedRequest(request);

    const model = this.modelRegistry.resolve(request.model);
    const context = createRequestContext({
      requestId: meta.requestId,
      clientApiKeyId: meta.apiKeyId,
      request,
      resolvedModel: model,
      timeoutMs: this.defaultTimeoutMs,
    });
    const logger = withRequestContext(this.logger, context);
    const prompt = this.renderPrompt(request);
    const lease = await this.sessionPool.acquire(context);
    const completionId = generateChatCompletionId();
    const created = unixTimestampSeconds();
    const startedAt = Date.now();

    try {
      logger.info("chat_completion_started", {
        sessionId: lease.sessionId,
        backendModel: model.backendModel,
      });

      const backendResult = await lease.adapter.send({
        requestId: context.requestId,
        backendModel: model.backendModel,
        prompt,
        timeoutMs: context.timeoutMs,
      });

      this.metrics.timing(
        "chat_completion_duration_ms",
        Date.now() - startedAt,
        {
          stream: false,
          model: model.id,
        },
      );

      logger.info("chat_completion_completed", {
        sessionId: lease.sessionId,
        backendModel: model.backendModel,
        kind: backendResult.kind,
      });

      return this.responseTranslator.translate({
        completionId,
        created,
        publicModelId: model.id,
        backendResult,
      });
    } catch (error) {
      await this.handleLeaseFailure(lease, context, error);
      throw error;
    } finally {
      await lease.release();
    }
  }

  async streamCompletion(
    request: ChatCompletionRequest,
    meta: ChatRequestMeta,
    writer: SseWriter,
  ): Promise<void> {
    this.assertSupportedRequest(request);

    const model = this.modelRegistry.resolve(request.model);
    if (!model.supportsStream) {
      throw new AppError(`Model "${model.id}" does not support streaming`, {
        code: "MODEL_STREAM_UNSUPPORTED",
        statusCode: 400,
        type: "invalid_request_error",
        param: "model",
      });
    }

    const context = createRequestContext({
      requestId: meta.requestId,
      clientApiKeyId: meta.apiKeyId,
      request,
      resolvedModel: model,
      timeoutMs: this.defaultTimeoutMs,
    });
    const logger = withRequestContext(this.logger, context);
    const prompt = this.renderPrompt(request);
    const lease = await this.sessionPool.acquire(context);
    const envelope = {
      completionId: generateChatCompletionId(),
      created: unixTimestampSeconds(),
      publicModelId: model.id,
    };
    const startedAt = Date.now();

    try {
      writer.open();
      this.streamTranslator.writeStart(writer, envelope);

      logger.info("chat_completion_stream_started", {
        sessionId: lease.sessionId,
        backendModel: model.backendModel,
      });

      await lease.adapter.sendStream({
        requestId: context.requestId,
        backendModel: model.backendModel,
        prompt,
        timeoutMs: context.timeoutMs,
        onChunk: (chunk) => {
          this.streamTranslator.writeDelta(writer, envelope, chunk.delta);
        },
      });

      this.streamTranslator.writeDone(writer, envelope);
      this.metrics.timing(
        "chat_completion_duration_ms",
        Date.now() - startedAt,
        {
          stream: true,
          model: model.id,
        },
      );

      logger.info("chat_completion_stream_completed", {
        sessionId: lease.sessionId,
        backendModel: model.backendModel,
      });
    } catch (error) {
      await this.handleLeaseFailure(lease, context, error);
      throw error;
    } finally {
      await lease.release();
      writer.close();
    }
  }

  private renderPrompt(request: ChatCompletionRequest): string {
    const normalizedMessages = this.messageNormalizer.normalize(request.messages);
    return this.promptRenderer.render(normalizedMessages);
  }

  private assertSupportedRequest(request: ChatCompletionRequest): void {
    if (request.tools !== undefined) {
      throw new AppError("tools are not supported in the current MVP", {
        code: "TOOLS_NOT_SUPPORTED",
        statusCode: 400,
        type: "invalid_request_error",
        param: "tools",
      });
    }

    if (request.tool_choice !== undefined) {
      throw new AppError("tool_choice is not supported in the current MVP", {
        code: "TOOL_CHOICE_NOT_SUPPORTED",
        statusCode: 400,
        type: "invalid_request_error",
        param: "tool_choice",
      });
    }

    if (request.parallel_tool_calls !== undefined) {
      throw new AppError(
        "parallel_tool_calls is not supported in the current MVP",
        {
          code: "PARALLEL_TOOL_CALLS_NOT_SUPPORTED",
          statusCode: 400,
          type: "invalid_request_error",
          param: "parallel_tool_calls",
        },
      );
    }

    if (request.response_format !== undefined) {
      throw new AppError("response_format is not supported in the current MVP", {
        code: "RESPONSE_FORMAT_NOT_SUPPORTED",
        statusCode: 400,
        type: "invalid_request_error",
        param: "response_format",
      });
    }
  }

  private async handleLeaseFailure(
    lease: Awaited<ReturnType<SessionPoolService["acquire"]>>,
    context: RequestContext,
    error: unknown,
  ): Promise<void> {
    this.metrics.increment("chat_completion_errors_total", 1, {
      stream: context.stream,
      model: context.resolvedModel,
    });

    const logger = withRequestContext(this.logger, context);
    logger.error("chat_completion_failed", {
      sessionId: lease.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (this.errorMapper.isSessionRecycleRecommended(error)) {
      await lease.markBroken(
        error instanceof Error ? error.message : "session recycle requested",
      );
    }
  }
}
