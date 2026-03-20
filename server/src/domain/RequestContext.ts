import type { ChatCompletionRequest } from "../types/openai";
import type { PublicModelDefinition } from "../types/internal";

export interface RequestContext {
  requestId: string;
  receivedAt: string;
  clientApiKeyId?: string;
  requestedModel: string;
  resolvedModel: string;
  stream: boolean;
  timeoutMs: number;
}

export interface CreateRequestContextInput {
  requestId: string;
  clientApiKeyId?: string;
  request: Pick<ChatCompletionRequest, "model" | "stream">;
  resolvedModel: PublicModelDefinition;
  timeoutMs: number;
}

export function createRequestContext(
  input: CreateRequestContextInput,
): RequestContext {
  return {
    requestId: input.requestId,
    receivedAt: new Date().toISOString(),
    clientApiKeyId: input.clientApiKeyId,
    requestedModel: input.request.model ?? input.resolvedModel.id,
    resolvedModel: input.resolvedModel.id,
    stream: input.request.stream ?? false,
    timeoutMs: input.timeoutMs,
  };
}
