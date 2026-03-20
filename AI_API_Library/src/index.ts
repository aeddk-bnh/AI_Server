export { GeminiWebClient, createGeminiWebClient } from "./client/GeminiWebClient";
export { ConsoleLogger, NoopLogger } from "./telemetry/Logger";
export { GeminiWebError, isGeminiWebError } from "./errors/GeminiWebError";
export type {
  GeminiAuthStateOptions,
  GeminiArchivedMediaFile,
  GeminiBrowserConnectionOptions,
  GeminiKnownModelId,
  GeminiMediaArchiveOptions,
  GeminiMediaArchiveRecord,
  GeminiMediaItem,
  GeminiMediaKind,
  GeminiModelOption,
  GeminiMediaRenderer,
  GeminiResponseKind,
  GeminiSessionInfo,
  GeminiSessionMode,
  GeminiStealthOptions,
  GeminiWebClientOptions,
  LoggerContext,
  LoggerLike,
  SaveAuthStateOptions,
  SendOptions,
  SendResult,
  StreamChunk,
} from "./types/public";
