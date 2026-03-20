import type { FastifyReply, FastifyRequest } from "fastify";

import { OpenAIErrorMapper } from "../adapters/OpenAIErrorMapper";
import { ChatCompletionRequestSchema } from "../schemas/openai-chat-completions";
import { ChatCompletionService } from "../services/ChatCompletionService";
import { SseWriter } from "../utils/sse";

export class ChatCompletionsController {
  constructor(
    private readonly chatCompletionService: ChatCompletionService,
    private readonly errorMapper: OpenAIErrorMapper,
  ) {}

  create = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const body = ChatCompletionRequestSchema.parse(request.body);

    if (body.stream) {
      reply.hijack();

      const writer = new SseWriter(reply.raw);

      try {
        await this.chatCompletionService.streamCompletion(
          body,
          {
            requestId: request.requestId,
            apiKeyId: request.apiKeyId,
          },
          writer,
        );
      } catch (error) {
        const mapped = this.errorMapper.map(error);

        if (!writer.started) {
          reply.raw.statusCode = mapped.statusCode;
          reply.raw.setHeader("Content-Type", "application/json; charset=utf-8");
          reply.raw.end(JSON.stringify(mapped.body));
          return;
        }

        writer.close();
      }

      return;
    }

    const response = await this.chatCompletionService.createCompletion(body, {
      requestId: request.requestId,
      apiKeyId: request.apiKeyId,
    });

    reply.send(response);
  };
}
