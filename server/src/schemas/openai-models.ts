import { z } from "zod";

export const OpenAIModelSchema = z.object({
  id: z.string(),
  object: z.literal("model"),
  created: z.number().int().nonnegative(),
  owned_by: z.string(),
});

export const OpenAIModelListSchema = z.object({
  object: z.literal("list"),
  data: z.array(OpenAIModelSchema),
});
