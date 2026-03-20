import path from "node:path";
import { createRequire } from "node:module";

import type { AppLogger } from "../telemetry/Logger";
import type {
  BackendSendInput,
  BackendSendResult,
  BackendStreamInput,
  ChatBackendSessionAdapter,
  SessionInfoSnapshot,
} from "../types/internal";
import { AppError } from "../utils/AppError";

interface GeminiChunkLike {
  text?: unknown;
  delta?: unknown;
  done?: unknown;
  kind?: unknown;
  media?: unknown;
}

interface GeminiSendResultLike {
  text?: unknown;
  kind?: unknown;
  media?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
}

interface GeminiClientLike {
  send(prompt: string, options?: Record<string, unknown>): Promise<GeminiSendResultLike>;
  sendStream(
    prompt: string,
    onChunk: (chunk: GeminiChunkLike) => void,
    options?: Record<string, unknown>,
  ): Promise<GeminiSendResultLike>;
  getSessionInfo(): Promise<SessionInfoSnapshot | null>;
  close(): Promise<void>;
}

interface GeminiModuleLike {
  createGeminiWebClient(options: Record<string, unknown>): Promise<GeminiClientLike>;
}

export interface CreateGeminiSessionAdapterInput {
  sessionId: string;
  moduleEntryPath?: string;
  clientOptions: Record<string, unknown>;
  logger: AppLogger;
}

export class GeminiSessionAdapter implements ChatBackendSessionAdapter {
  private constructor(
    public readonly sessionId: string,
    private readonly client: GeminiClientLike,
  ) {}

  static async create(
    input: CreateGeminiSessionAdapterInput,
  ): Promise<GeminiSessionAdapter> {
    const geminiModule = await loadGeminiModule(input.moduleEntryPath);
    const client = await geminiModule.createGeminiWebClient({
      ...input.clientOptions,
      logger: adaptGeminiLogger(input.logger),
    });

    return new GeminiSessionAdapter(input.sessionId, client);
  }

  async init(): Promise<void> {}

  async send(input: BackendSendInput): Promise<BackendSendResult> {
    try {
      const result = await this.client.send(input.prompt, {
        newChat: true,
        timeoutMs: input.timeoutMs,
        model: input.backendModel,
      });

      return normalizeSendResult(result);
    } catch (error) {
      throw mapGeminiError(error);
    }
  }

  async sendStream(input: BackendStreamInput): Promise<BackendSendResult> {
    try {
      const result = await this.client.sendStream(
        input.prompt,
        (chunk) => {
          input.onChunk({
            text: asString(chunk.text),
            delta: asString(chunk.delta),
            done: Boolean(chunk.done),
            kind: normalizeKind(chunk.kind),
            media: normalizeMedia(chunk.media),
          });
        },
        {
          newChat: true,
          timeoutMs: input.timeoutMs,
          model: input.backendModel,
        },
      );

      return normalizeSendResult(result);
    } catch (error) {
      throw mapGeminiError(error);
    }
  }

  async getSessionInfo(): Promise<SessionInfoSnapshot | null> {
    try {
      return await this.client.getSessionInfo();
    } catch (error) {
      throw mapGeminiError(error);
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

async function loadGeminiModule(
  explicitEntryPath?: string,
): Promise<GeminiModuleLike> {
  const require = createRequire(__filename);
  const candidates = buildModuleCandidates(explicitEntryPath);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const loaded = require(candidate) as GeminiModuleLike;
      if (typeof loaded.createGeminiWebClient === "function") {
        return loaded;
      }

      errors.push(`Loaded "${candidate}" but createGeminiWebClient was missing.`);
    } catch (error) {
      errors.push(
        `Failed to load "${candidate}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throw new AppError(
    "AI_API_Library is not available. Build AI_API_Library so dist/src/index.js exists, or set AI_API_LIBRARY_ENTRY_PATH.",
    {
      code: "BACKEND_MODULE_NOT_AVAILABLE",
      statusCode: 503,
      type: "server_error",
      details: {
        candidates,
        errors,
      },
    },
  );
}

function buildModuleCandidates(explicitEntryPath?: string): string[] {
  const candidates: string[] = [];

  if (explicitEntryPath) {
    candidates.push(explicitEntryPath);
  }

  candidates.push(
    path.resolve(__dirname, "../../../AI_API_Library/dist/src/index.js"),
  );
  candidates.push("gemini-web-playwright");

  return [...new Set(candidates)];
}

function adaptGeminiLogger(logger: AppLogger): Record<string, unknown> {
  return {
    debug(event: string, context?: Record<string, unknown>) {
      logger.debug(event, context);
    },
    info(event: string, context?: Record<string, unknown>) {
      logger.info(event, context);
    },
    warn(event: string, context?: Record<string, unknown>) {
      logger.warn(event, context);
    },
    error(event: string, context?: Record<string, unknown>) {
      logger.error(event, context);
    },
  };
}

function normalizeSendResult(result: GeminiSendResultLike): BackendSendResult {
  return {
    text: asString(result.text),
    kind: normalizeKind(result.kind),
    media: normalizeMedia(result.media),
    startedAt: asTimestamp(result.startedAt),
    completedAt: asTimestamp(result.completedAt),
  };
}

function mapGeminiError(error: unknown): AppError {
  const code = getStringProperty(error, "code");
  const message =
    error instanceof Error ? error.message : "Gemini backend request failed";

  switch (code) {
    case "AUTH_REQUIRED":
    case "CHECKPOINT_REQUIRED":
      return new AppError(message, {
        code: "BACKEND_AUTH_REQUIRED",
        statusCode: 503,
        type: "server_error",
        details: { backendCode: code },
        cause: error,
      });
    case "MODEL_UNAVAILABLE":
      return new AppError(message, {
        code: "BACKEND_MODEL_UNAVAILABLE",
        statusCode: 400,
        type: "invalid_request_error",
        param: "model",
        details: { backendCode: code },
        cause: error,
      });
    case "RESPONSE_TIMEOUT":
      return new AppError(message, {
        code: "BACKEND_TIMEOUT",
        statusCode: 504,
        type: "server_error",
        details: { backendCode: code },
        cause: error,
      });
    case "PAGE_BROKEN":
    case "COMPOSER_NOT_FOUND":
    case "SEND_BUTTON_NOT_FOUND":
    case "SUBMIT_FAILED":
      return new AppError(message, {
        code: "BACKEND_PAGE_BROKEN",
        statusCode: 502,
        type: "server_error",
        details: { backendCode: code },
        cause: error,
      });
    case "RESPONSE_NOT_FOUND":
      return new AppError(message, {
        code: "BACKEND_RESPONSE_NOT_FOUND",
        statusCode: 502,
        type: "server_error",
        details: { backendCode: code },
        cause: error,
      });
    default:
      return new AppError(message, {
        code: "BACKEND_REQUEST_FAILED",
        statusCode: 502,
        type: "server_error",
        details: code ? { backendCode: code } : undefined,
        cause: error,
      });
  }
}

function getStringProperty(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asTimestamp(value: unknown): string {
  return typeof value === "string" && value ? value : new Date().toISOString();
}

function normalizeKind(value: unknown): BackendSendResult["kind"] {
  return value === "image" || value === "video" || value === "mixed"
    ? value
    : "text";
}

function normalizeMedia(value: unknown): BackendSendResult["media"] {
  return Array.isArray(value)
    ? value.map((item) => ({
        kind:
          item && typeof item === "object" && item.kind === "video"
            ? "video"
            : "image",
        url:
          item && typeof item === "object" && typeof item.url === "string"
            ? item.url
            : null,
        alt:
          item && typeof item === "object" && typeof item.alt === "string"
            ? item.alt
            : null,
        posterUrl:
          item && typeof item === "object" && typeof item.posterUrl === "string"
            ? item.posterUrl
            : null,
        renderer:
          item && typeof item === "object" && item.renderer === "canvas"
            ? "canvas"
            : "element",
        width:
          item && typeof item === "object" && typeof item.width === "number"
            ? item.width
            : null,
        height:
          item && typeof item === "object" && typeof item.height === "number"
            ? item.height
            : null,
      }))
    : [];
}
