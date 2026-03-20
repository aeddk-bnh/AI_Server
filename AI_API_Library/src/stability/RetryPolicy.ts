import type { GeminiWebError, GeminiWebPhase } from "../errors/GeminiWebError";
import type { LoggerLike } from "../types/public";

import { toGeminiWebError } from "../errors/GeminiWebError";
import { log } from "../telemetry/Logger";

export interface RetryRunOptions {
  attempts?: number;
  phase: GeminiWebPhase;
  onRetry?: (error: GeminiWebError, attempt: number) => Promise<void> | void;
}

export class RetryPolicy {
  constructor(
    private readonly defaultAttempts: number,
    private readonly logger: LoggerLike,
  ) {}

  async run<T>(
    task: (attempt: number) => Promise<T>,
    options: RetryRunOptions,
  ): Promise<T> {
    const attempts = options.attempts ?? this.defaultAttempts;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await task(attempt);
      } catch (error) {
        const mapped = toGeminiWebError(error, {
          code: "PAGE_BROKEN",
          phase: options.phase,
          retryable: false,
        });

        lastError = mapped;

        if (!mapped.retryable || attempt >= attempts) {
          throw mapped;
        }

        log(this.logger, "warn", "retry_scheduled", {
          attempt,
          phase: mapped.phase,
          code: mapped.code,
          message: mapped.message,
        });

        await options.onRetry?.(mapped, attempt);
      }
    }

    throw lastError;
  }
}

