import path from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

import type { BackendMode } from "../types/internal";
import type { LogLevel } from "../telemetry/Logger";

export interface AppConfig {
  server: {
    host: string;
    port: number;
    apiKeys: string[];
    logLevel: LogLevel;
  };
  backend: {
    mode: BackendMode;
    libraryEntryPath?: string;
  };
  session: {
    poolSize: number;
    warmupSize: number;
    minReadySessions: number;
    acquireTimeoutMs: number;
    defaultTimeoutMs: number;
    userDataDirRoot: string;
    storageStatePath?: string;
    headless: boolean;
    stealth: boolean;
  };
  models: {
    aliasConfigPath?: string;
  };
}

const envSchema = z.object({
  SERVER_HOST: z.string().default("0.0.0.0"),
  SERVER_PORT: z.coerce.number().int().positive().default(8080),
  SERVER_API_KEYS: z.string().default("dev-key"),
  SERVER_LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  SERVER_BACKEND_MODE: z.enum(["stub", "gemini-web"]).default("stub"),
  SESSION_POOL_SIZE: z.coerce.number().int().positive().default(2),
  SESSION_WARMUP_SIZE: z.coerce.number().int().nonnegative().optional(),
  SESSION_MIN_READY_SESSIONS: z
    .coerce.number()
    .int()
    .nonnegative()
    .optional(),
  SESSION_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  SESSION_DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(420_000),
  SESSION_USER_DATA_DIR_ROOT: z.string().default("./.server-profiles"),
  SESSION_STORAGE_STATE_PATH: z.string().optional(),
  SESSION_HEADLESS: z.string().default("true"),
  SESSION_STEALTH: z.string().default("false"),
  AI_API_LIBRARY_ENTRY_PATH: z.string().optional(),
  MODEL_ALIAS_CONFIG_PATH: z.string().optional(),
});

export function loadAppConfig(): AppConfig {
  dotenv.config();

  const parsed = envSchema.parse(process.env);
  const poolSize = parsed.SESSION_POOL_SIZE;
  const warmupSize = Math.min(parsed.SESSION_WARMUP_SIZE ?? poolSize, poolSize);
  const minReadySessions = Math.min(
    parsed.SESSION_MIN_READY_SESSIONS ?? 1,
    poolSize,
  );
  const apiKeys = parsed.SERVER_API_KEYS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    server: {
      host: parsed.SERVER_HOST,
      port: parsed.SERVER_PORT,
      apiKeys,
      logLevel: parsed.SERVER_LOG_LEVEL as LogLevel,
    },
    backend: {
      mode: parsed.SERVER_BACKEND_MODE as BackendMode,
      libraryEntryPath: optionalResolvedPath(parsed.AI_API_LIBRARY_ENTRY_PATH),
    },
    session: {
      poolSize,
      warmupSize,
      minReadySessions,
      acquireTimeoutMs: parsed.SESSION_ACQUIRE_TIMEOUT_MS,
      defaultTimeoutMs: parsed.SESSION_DEFAULT_TIMEOUT_MS,
      userDataDirRoot: resolvePath(parsed.SESSION_USER_DATA_DIR_ROOT),
      storageStatePath: optionalResolvedPath(parsed.SESSION_STORAGE_STATE_PATH),
      headless: parseBoolean(parsed.SESSION_HEADLESS),
      stealth: parseBoolean(parsed.SESSION_STEALTH),
    },
    models: {
      aliasConfigPath: optionalResolvedPath(parsed.MODEL_ALIAS_CONFIG_PATH),
    },
  };
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function resolvePath(value: string): string {
  return path.resolve(process.cwd(), value);
}

function optionalResolvedPath(value?: string): string | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }

  return resolvePath(value);
}
