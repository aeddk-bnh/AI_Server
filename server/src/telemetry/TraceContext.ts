import type { RequestContext } from "../domain/RequestContext";
import type { AppLogger } from "./Logger";

export function withRequestContext(
  logger: AppLogger,
  context: RequestContext,
): AppLogger {
  return logger.child({
    requestId: context.requestId,
    requestedModel: context.requestedModel,
    resolvedModel: context.resolvedModel,
    stream: context.stream,
  });
}
