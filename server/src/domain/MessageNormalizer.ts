import type {
  ChatCompletionMessageParam,
  OpenAIRole,
  OpenAITextContentPart,
} from "../types/openai";
import { AppError } from "../utils/AppError";

export interface NormalizedMessage {
  role: OpenAIRole;
  text: string;
}

export class MessageNormalizer {
  normalize(messages: ChatCompletionMessageParam[]): NormalizedMessage[] {
    if (messages.length === 0) {
      throw new AppError("messages must contain at least one item", {
        code: "MESSAGES_REQUIRED",
        statusCode: 400,
        type: "invalid_request_error",
        param: "messages",
      });
    }

    const normalized = messages.map((message) => ({
      role: message.role,
      text: this.normalizeContent(message.content),
    }));

    const hasUserMessage = normalized.some(
      (message) => message.role === "user" && message.text.trim().length > 0,
    );

    if (!hasUserMessage) {
      throw new AppError("At least one non-empty user message is required", {
        code: "USER_MESSAGE_REQUIRED",
        statusCode: 400,
        type: "invalid_request_error",
        param: "messages",
      });
    }

    return normalized;
  }

  private normalizeContent(
    content: ChatCompletionMessageParam["content"],
  ): string {
    if (typeof content === "string") {
      return content.trim();
    }

    const segments = content.map((part) => this.normalizePart(part)).filter(Boolean);

    if (segments.length === 0) {
      throw new AppError("Only text content parts are currently supported", {
        code: "UNSUPPORTED_CONTENT_PART",
        statusCode: 400,
        type: "invalid_request_error",
        param: "messages",
      });
    }

    return segments.join("\n").trim();
  }

  private normalizePart(part: OpenAITextContentPart): string {
    if (part.type !== "text") {
      throw new AppError(`Unsupported content part type "${part.type}"`, {
        code: "UNSUPPORTED_CONTENT_PART",
        statusCode: 400,
        type: "invalid_request_error",
        param: "messages",
      });
    }

    return part.text.trim();
  }
}
