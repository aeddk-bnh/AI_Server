export type GeminiWebErrorCode =
  | "AUTH_REQUIRED"
  | "CHECKPOINT_REQUIRED"
  | "COMPOSER_NOT_FOUND"
  | "MODEL_PICKER_NOT_FOUND"
  | "MODEL_NOT_FOUND"
  | "MODEL_UNAVAILABLE"
  | "MODEL_SELECTION_FAILED"
  | "SEND_BUTTON_NOT_FOUND"
  | "SUBMIT_FAILED"
  | "RESPONSE_TIMEOUT"
  | "RESPONSE_NOT_FOUND"
  | "PAGE_BROKEN";

export type GeminiWebPhase =
  | "session_open"
  | "auth_check"
  | "navigation"
  | "model_select"
  | "compose"
  | "submit"
  | "response_wait"
  | "response_read"
  | "request"
  | "close";

export interface ArtifactSummary {
  screenshotPath?: string;
  htmlPath?: string;
  url?: string;
}

export interface GeminiWebErrorOptions {
  code: GeminiWebErrorCode;
  phase: GeminiWebPhase;
  retryable?: boolean;
  details?: Record<string, unknown>;
  artifacts?: ArtifactSummary;
  cause?: unknown;
}

export class GeminiWebError extends Error {
  readonly code: GeminiWebErrorCode;
  readonly phase: GeminiWebPhase;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;
  artifacts: ArtifactSummary | undefined;

  constructor(message: string, options: GeminiWebErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "GeminiWebError";
    this.code = options.code;
    this.phase = options.phase;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.artifacts = options.artifacts;
  }
}

export function isGeminiWebError(value: unknown): value is GeminiWebError {
  return value instanceof GeminiWebError;
}

export function toGeminiWebError(
  value: unknown,
  fallback: GeminiWebErrorOptions,
  fallbackMessage = "Gemini web request failed",
): GeminiWebError {
  if (isGeminiWebError(value)) {
    return value;
  }

  if (value instanceof Error) {
    return new GeminiWebError(value.message, {
      ...fallback,
      cause: value,
    });
  }

  return new GeminiWebError(fallbackMessage, fallback);
}
