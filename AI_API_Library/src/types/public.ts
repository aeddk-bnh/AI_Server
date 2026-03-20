import type { BrowserType, ViewportSize } from "playwright";

export interface LoggerContext {
  [key: string]: unknown;
}

export interface LoggerLike {
  debug?(event: string, context?: LoggerContext): void;
  info?(event: string, context?: LoggerContext): void;
  warn?(event: string, context?: LoggerContext): void;
  error?(event: string, context?: LoggerContext): void;
}

export interface GeminiWebClientOptions {
  userDataDir: string;
  headless?: boolean;
  baseUrl?: string;
  defaultTimeoutMs?: number;
  pollIntervalMs?: number;
  stableWindowMs?: number;
  maxRetries?: number;
  screenshotsOnError?: boolean;
  artifactsDir?: string;
  mediaArchive?: GeminiMediaArchiveOptions;
  browserConnection?: GeminiBrowserConnectionOptions;
  authState?: GeminiAuthStateOptions;
  stealth?: GeminiStealthOptions;
  logger?: LoggerLike;
  launchOptions?: Omit<
    Exclude<Parameters<BrowserType["launchPersistentContext"]>[1], undefined>,
    "headless"
  >;
}

export interface GeminiBrowserConnectionOptions {
  cdpEndpointURL?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface GeminiAuthStateOptions {
  storageStatePath?: string;
  indexedDB?: boolean;
}

export interface GeminiStealthOptions {
  enabled?: boolean;
  usePlugin?: boolean;
  recycleInitialPages?: boolean;
  stripAutomationFlags?: boolean;
  webdriverFallback?: boolean;
  locale?: string;
  languages?: string[];
  timezoneId?: string;
  userAgent?: string;
  maskLinux?: boolean;
  viewport?: ViewportSize | null;
  screen?: ViewportSize;
  extraHTTPHeaders?: Record<string, string>;
  launchArgs?: string[];
  ignoreDefaultArgs?: string[];
  enabledEvasions?: string[];
  disabledEvasions?: string[];
}

export interface SendOptions {
  newChat?: boolean;
  timeoutMs?: number;
  model?: string;
}

export type GeminiResponseKind = "text" | "image" | "video" | "mixed";
export type GeminiMediaKind = "image" | "video";
export type GeminiMediaRenderer = "element" | "canvas";
export type GeminiKnownModelId = "fast" | "thinking" | "pro";
export type GeminiSessionMode = "persistent-context" | "storage-state" | "cdp-browser";

export interface GeminiModelOption {
  id: string;
  label: string;
  description: string | null;
  enabled: boolean;
  selected: boolean;
  testId: string | null;
}

export interface GeminiMediaArchiveOptions {
  enabled?: boolean;
  directory?: string;
  downloadMedia?: boolean;
}

export interface GeminiMediaItem {
  kind: GeminiMediaKind;
  url: string | null;
  alt: string | null;
  posterUrl: string | null;
  renderer: GeminiMediaRenderer;
  width: number | null;
  height: number | null;
}

export interface GeminiArchivedMediaFile {
  mediaIndex: number;
  kind: GeminiMediaKind;
  sourceUrl: string | null;
  savedPath: string | null;
  contentType: string | null;
  error?: string;
}

export interface GeminiMediaArchiveRecord {
  directory: string;
  manifestPath: string;
  promptPath: string;
  responseTextPath: string | null;
  responseHtmlPath: string | null;
  responseScreenshotPath: string | null;
  mediaFiles: GeminiArchivedMediaFile[];
}

export interface SaveAuthStateOptions {
  indexedDB?: boolean;
}

export interface GeminiSessionInfo {
  mode: GeminiSessionMode;
  headless: boolean;
  stealth: boolean;
  fallbackFromCdp: boolean;
  userDataDir?: string;
  storageStatePath?: string;
  cdpEndpointURL?: string;
}

export interface SendResult {
  requestId: string;
  text: string;
  kind: GeminiResponseKind;
  media: GeminiMediaItem[];
  archive?: GeminiMediaArchiveRecord;
  startedAt: string;
  completedAt: string;
}

export interface StreamChunk {
  text: string;
  delta: string;
  done: boolean;
  kind: GeminiResponseKind;
  media: GeminiMediaItem[];
}
