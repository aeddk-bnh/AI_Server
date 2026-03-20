import type { ChatCompletionChunkResponse } from "../types/openai";
import { SseWriter } from "../utils/sse";

export interface StreamEnvelope {
  completionId: string;
  created: number;
  publicModelId: string;
}

export class OpenAIStreamTranslator {
  writeStart(writer: SseWriter, envelope: StreamEnvelope): void {
    writer.writeData(this.buildChunk(envelope, { role: "assistant" }, null));
  }

  writeDelta(writer: SseWriter, envelope: StreamEnvelope, delta: string): void {
    if (!delta) {
      return;
    }

    writer.writeData(this.buildChunk(envelope, { content: delta }, null));
  }

  writeDone(writer: SseWriter, envelope: StreamEnvelope): void {
    writer.writeData(this.buildChunk(envelope, {}, "stop"));
    writer.writeRawData("[DONE]");
  }

  private buildChunk(
    envelope: StreamEnvelope,
    delta: ChatCompletionChunkResponse["choices"][number]["delta"],
    finishReason: ChatCompletionChunkResponse["choices"][number]["finish_reason"],
  ): ChatCompletionChunkResponse {
    return {
      id: envelope.completionId,
      object: "chat.completion.chunk",
      created: envelope.created,
      model: envelope.publicModelId,
      choices: [
        {
          index: 0,
          delta,
          finish_reason: finishReason,
        },
      ],
    };
  }
}
