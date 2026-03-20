import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { AppLogger } from "../telemetry/Logger";
import type { ModelAliasConfig } from "../types/internal";

const publicModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  ownedBy: z.string().min(1).default("ai-server"),
  backendProvider: z.enum(["stub", "gemini-web"]),
  backendModel: z.string().min(1),
  supportsStream: z.boolean().default(true),
  supportsVision: z.boolean().default(false),
  supportsTools: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

const modelAliasConfigSchema = z.object({
  defaultModel: z.string().min(1),
  models: z.array(publicModelSchema).min(1),
});

const defaultModelAliasConfig: ModelAliasConfig = {
  defaultModel: "gpt-5.2",
  models: [
    {
      id: "gpt-5.2",
      label: "GPT-5.2",
      description: "Default reasoning alias routed to Gemini thinking mode.",
      ownedBy: "ai-server",
      backendProvider: "gemini-web",
      backendModel: "thinking",
      supportsStream: true,
      supportsVision: false,
      supportsTools: false,
      enabled: true,
    },
    {
      id: "gpt-5.2-mini",
      label: "GPT-5.2 Mini",
      description: "Fast alias routed to Gemini fast mode.",
      ownedBy: "ai-server",
      backendProvider: "gemini-web",
      backendModel: "fast",
      supportsStream: true,
      supportsVision: false,
      supportsTools: false,
      enabled: true,
    },
    {
      id: "gpt-5.2-pro",
      label: "GPT-5.2 Pro",
      description: "Pro alias routed to Gemini pro mode.",
      ownedBy: "ai-server",
      backendProvider: "gemini-web",
      backendModel: "pro",
      supportsStream: true,
      supportsVision: false,
      supportsTools: false,
      enabled: true,
    },
  ],
};

export async function loadModelAliasConfig(
  configPath: string | undefined,
  logger: AppLogger,
): Promise<ModelAliasConfig> {
  if (!configPath) {
    logger.info("model_alias_config_default_loaded", {
      defaultModel: defaultModelAliasConfig.defaultModel,
      count: defaultModelAliasConfig.models.length,
    });

    return defaultModelAliasConfig;
  }

  const raw = await readFile(configPath, "utf8");
  const parsed = modelAliasConfigSchema.parse(JSON.parse(raw));

  logger.info("model_alias_config_loaded", {
    path: configPath,
    defaultModel: parsed.defaultModel,
    count: parsed.models.length,
  });

  return parsed;
}
