import { ZodError } from "zod";

import type { OpenAIErrorResponse } from "../types/openai";
import { isAppError } from "../utils/AppError";

export interface MappedHttpError {
  statusCode: number;
  body: OpenAIErrorResponse;
}

export class OpenAIErrorMapper {
  map(error: unknown): MappedHttpError {
    if (error instanceof ZodError) {
      return {
        statusCode: 400,
        body: {
          error: {
            message: error.issues
              .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
              .join("; "),
            type: "invalid_request_error",
            code: "SCHEMA_VALIDATION_FAILED",
            param: "request",
          },
        },
      };
    }

    if (isAppError(error)) {
      return {
        statusCode: error.statusCode,
        body: {
          error: {
            message: error.message,
            type: error.type,
            code: error.code,
            param: error.param,
          },
        },
      };
    }

    const unknownError = error instanceof Error ? error : new Error(String(error));

    return {
      statusCode: 500,
      body: {
        error: {
          message: unknownError.message || "Unexpected server error",
          type: "server_error",
          code: "INTERNAL_SERVER_ERROR",
          param: null,
        },
      },
    };
  }

  isSessionRecycleRecommended(error: unknown): boolean {
    if (!isAppError(error)) {
      return false;
    }

    return [
      "BACKEND_AUTH_REQUIRED",
      "BACKEND_PAGE_BROKEN",
      "BACKEND_RESPONSE_NOT_FOUND",
    ].includes(error.code);
  }
}
