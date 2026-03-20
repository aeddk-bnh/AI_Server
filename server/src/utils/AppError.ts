export interface AppErrorOptions {
  code: string;
  statusCode: number;
  type?: string;
  param?: string | null;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly type: string;
  readonly param: string | null;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(message: string, options: AppErrorOptions) {
    super(message);
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.type = options.type ?? "api_error";
    this.param = options.param ?? null;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
