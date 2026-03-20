import { z } from "zod";

const TextContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([z.string(), z.array(TextContentPartSchema)]),
  name: z.string().optional(),
});

export const ChatCompletionRequestSchema = z
  .object({
    model: z.string().optional(),
    messages: z.array(MessageSchema).min(1),
    stream: z.boolean().optional().default(false),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    n: z.number().optional(),
    presence_penalty: z.number().optional(),
    frequency_penalty: z.number().optional(),
    user: z.string().optional(),
    tools: z.unknown().optional(),
    tool_choice: z.unknown().optional(),
    parallel_tool_calls: z.boolean().optional(),
    response_format: z.unknown().optional(),
  })
  .passthrough();
