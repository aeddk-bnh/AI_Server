import type { preHandlerHookHandler } from "fastify";

import { AppError } from "../utils/AppError";

export function createApiKeyAuth(apiKeys: string[]): preHandlerHookHandler {
  const keyMap = new Map(apiKeys.map((key, index) => [key, `key-${index + 1}`]));

  return async (request) => {
    if (keyMap.size === 0) {
      return;
    }

    const authorization = request.headers.authorization;
    const token = readBearerToken(authorization);

    if (!token) {
      throw new AppError("Missing Bearer token", {
        code: "API_KEY_MISSING",
        statusCode: 401,
        type: "authentication_error",
      });
    }

    const apiKeyId = keyMap.get(token);
    if (!apiKeyId) {
      throw new AppError("Invalid API key", {
        code: "API_KEY_INVALID",
        statusCode: 401,
        type: "authentication_error",
      });
    }

    request.apiKeyId = apiKeyId;
  };
}

function readBearerToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) {
    return undefined;
  }

  const [scheme, token] = headerValue.split(" ", 2);
  if (scheme !== "Bearer" || !token?.trim()) {
    return undefined;
  }

  return token.trim();
}
