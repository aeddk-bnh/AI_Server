import { randomUUID } from "node:crypto";

import type { RequestContext } from "../types/internal";
import type { SendOptions } from "../types/public";

export function createRequestContext(
  defaultTimeoutMs: number,
  options: SendOptions | undefined,
): RequestContext {
  return {
    requestId: randomUUID(),
    startedAt: new Date().toISOString(),
    timeoutMs: options?.timeoutMs ?? defaultTimeoutMs,
    newChat: options?.newChat ?? false,
    ...(options?.model ? { model: options.model } : {}),
  };
}
