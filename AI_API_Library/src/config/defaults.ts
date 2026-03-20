import path from "node:path";

import type {
  GeminiAuthStateOptions,
  GeminiBrowserConnectionOptions,
  GeminiStealthOptions,
  GeminiWebClientOptions,
} from "../types/public";
import type { BrowserType } from "playwright";

import { NoopLogger } from "../telemetry/Logger";

export const DEFAULT_BASE_URL = "https://gemini.google.com/app";
export const DEFAULT_TIMEOUT_MS = 420_000;
export const DEFAULT_POLL_INTERVAL_MS = 400;
export const DEFAULT_STABLE_WINDOW_MS = 1_500;
export const DEFAULT_MAX_RETRIES = 1;
export const DEFAULT_ARTIFACTS_DIR = "playwright-artifacts";
export const DEFAULT_MEDIA_ARCHIVE_SUBDIR = "media-responses";

export interface ResolvedGeminiMediaArchiveOptions {
  enabled: boolean;
  directory: string;
  downloadMedia: boolean;
}

export interface ResolvedGeminiBrowserConnectionOptions {
  cdpEndpointURL?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface ResolvedGeminiAuthStateOptions {
  storageStatePath?: string;
  indexedDB: boolean;
}

export interface ResolvedGeminiStealthOptions {
  enabled: boolean;
  usePlugin: boolean;
  recycleInitialPages: boolean;
  stripAutomationFlags: boolean;
  webdriverFallback: boolean;
  locale?: string;
  languages?: string[];
  timezoneId?: string;
  userAgent?: string;
  maskLinux: boolean;
  viewport?: GeminiStealthOptions["viewport"];
  screen?: GeminiStealthOptions["screen"];
  extraHTTPHeaders?: Record<string, string>;
  launchArgs: string[];
  ignoreDefaultArgs: string[];
  enabledEvasions?: string[];
  disabledEvasions?: string[];
}

export interface ResolvedGeminiWebClientOptions {
  userDataDir: string;
  headless: boolean;
  baseUrl: string;
  defaultTimeoutMs: number;
  pollIntervalMs: number;
  stableWindowMs: number;
  maxRetries: number;
  screenshotsOnError: boolean;
  artifactsDir: string;
  mediaArchive: ResolvedGeminiMediaArchiveOptions;
  browserConnection: ResolvedGeminiBrowserConnectionOptions;
  authState: ResolvedGeminiAuthStateOptions;
  stealth: ResolvedGeminiStealthOptions;
  logger: NonNullable<GeminiWebClientOptions["logger"]>;
  launchOptions: Omit<
    Exclude<Parameters<BrowserType["launchPersistentContext"]>[1], undefined>,
    "headless"
  >;
}

export function resolveClientOptions(
  input: GeminiWebClientOptions,
): ResolvedGeminiWebClientOptions {
  const artifactsDir = path.resolve(input.artifactsDir ?? DEFAULT_ARTIFACTS_DIR);

  return {
    userDataDir: path.resolve(input.userDataDir),
    headless: input.headless ?? false,
    baseUrl: input.baseUrl ?? DEFAULT_BASE_URL,
    defaultTimeoutMs: input.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    pollIntervalMs: input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    stableWindowMs: input.stableWindowMs ?? DEFAULT_STABLE_WINDOW_MS,
    maxRetries: input.maxRetries ?? DEFAULT_MAX_RETRIES,
    screenshotsOnError: input.screenshotsOnError ?? true,
    artifactsDir,
    mediaArchive: {
      enabled: input.mediaArchive?.enabled ?? true,
      directory: path.resolve(
        input.mediaArchive?.directory ??
          path.join(artifactsDir, DEFAULT_MEDIA_ARCHIVE_SUBDIR),
      ),
      downloadMedia: input.mediaArchive?.downloadMedia ?? true,
    },
    browserConnection: resolveBrowserConnectionOptions(input.browserConnection),
    authState: resolveAuthStateOptions(input.authState),
    stealth: {
      enabled: input.stealth?.enabled ?? false,
      usePlugin: input.stealth?.usePlugin ?? true,
      recycleInitialPages: input.stealth?.recycleInitialPages ?? true,
      stripAutomationFlags: input.stealth?.stripAutomationFlags ?? true,
      webdriverFallback: input.stealth?.webdriverFallback ?? true,
      ...(input.stealth?.locale ? { locale: input.stealth.locale } : {}),
      ...(input.stealth?.languages?.length
        ? { languages: [...input.stealth.languages] }
        : {}),
      ...(input.stealth?.timezoneId
        ? { timezoneId: input.stealth.timezoneId }
        : {}),
      ...(input.stealth?.userAgent
        ? { userAgent: input.stealth.userAgent }
        : {}),
      maskLinux: input.stealth?.maskLinux ?? true,
      ...(Object.prototype.hasOwnProperty.call(input.stealth ?? {}, "viewport")
        ? { viewport: input.stealth?.viewport }
        : {}),
      ...(input.stealth?.screen ? { screen: input.stealth.screen } : {}),
      ...(input.stealth?.extraHTTPHeaders
        ? { extraHTTPHeaders: { ...input.stealth.extraHTTPHeaders } }
        : {}),
      launchArgs: [...(input.stealth?.launchArgs ?? [])],
      ignoreDefaultArgs: [...(input.stealth?.ignoreDefaultArgs ?? [])],
      ...(input.stealth?.enabledEvasions?.length
        ? { enabledEvasions: [...input.stealth.enabledEvasions] }
        : {}),
      ...(input.stealth?.disabledEvasions?.length
        ? { disabledEvasions: [...input.stealth.disabledEvasions] }
        : {}),
    },
    logger: input.logger ?? new NoopLogger(),
    launchOptions: input.launchOptions ?? {},
  };
}

function resolveBrowserConnectionOptions(
  input?: GeminiBrowserConnectionOptions,
): ResolvedGeminiBrowserConnectionOptions {
  return {
    ...(input?.cdpEndpointURL
      ? { cdpEndpointURL: input.cdpEndpointURL.trim() }
      : {}),
    ...(input?.headers
      ? { headers: { ...input.headers } }
      : {}),
    ...(typeof input?.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
  };
}

function resolveAuthStateOptions(
  input?: GeminiAuthStateOptions,
): ResolvedGeminiAuthStateOptions {
  return {
    ...(input?.storageStatePath
      ? { storageStatePath: path.resolve(input.storageStatePath) }
      : {}),
    indexedDB: input?.indexedDB ?? true,
  };
}
