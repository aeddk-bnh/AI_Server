export type OpenAIRole = "system" | "user" | "assistant";

export interface OpenAITextContentPart {
  type: "text";
  text: string;
}

export type OpenAIMessageContent = string | OpenAITextContentPart[];

export interface ChatCompletionMessageParam {
  role: OpenAIRole;
  content: OpenAIMessageContent;
  name?: string;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatCompletionMessageParam[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  n?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
  tools?: unknown;
  tool_choice?: unknown;
  parallel_tool_calls?: boolean;
  response_format?: unknown;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string;
  };
  finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: "assistant";
    content?: string;
  };
  finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
}

export interface ChatCompletionChunkResponse {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

export interface ModelObject {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface ModelListResponse {
  object: "list";
  data: ModelObject[];
}

export interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string | null;
    code?: string | null;
  };
}
