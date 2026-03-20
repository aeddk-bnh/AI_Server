import type { BackendSendResult } from "../types/internal";
import type { ChatCompletionResponse } from "../types/openai";

export interface TranslateResponseInput {
  completionId: string;
  created: number;
  publicModelId: string;
  backendResult: BackendSendResult;
}

export class OpenAIResponseTranslator {
  translate(input: TranslateResponseInput): ChatCompletionResponse {
    return {
      id: input.completionId,
      object: "chat.completion",
      created: input.created,
      model: input.publicModelId,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: input.backendResult.text,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }
}
