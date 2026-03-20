import type { LoggerContext, LoggerLike } from "../types/public";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class NoopLogger implements LoggerLike {
  debug(): void {}

  info(): void {}

  warn(): void {}

  error(): void {}
}

export class ConsoleLogger implements LoggerLike {
  debug(event: string, context?: LoggerContext): void {
    console.debug(formatLogMessage(event, context));
  }

  info(event: string, context?: LoggerContext): void {
    console.info(formatLogMessage(event, context));
  }

  warn(event: string, context?: LoggerContext): void {
    console.warn(formatLogMessage(event, context));
  }

  error(event: string, context?: LoggerContext): void {
    console.error(formatLogMessage(event, context));
  }
}

export function log(
  logger: LoggerLike,
  level: LogLevel,
  event: string,
  context?: LoggerContext,
): void {
  logger[level]?.(event, context);
}

function formatLogMessage(event: string, context?: LoggerContext): string {
  if (!context || Object.keys(context).length === 0) {
    return `[gemini-web] ${event}`;
  }

  return `[gemini-web] ${event} ${JSON.stringify(context)}`;
}

