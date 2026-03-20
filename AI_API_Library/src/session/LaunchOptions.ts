import type { Browser, BrowserType } from "playwright";

type PersistentLaunchOptions = Omit<
  Exclude<Parameters<BrowserType["launchPersistentContext"]>[1], undefined>,
  "headless"
>;

export type ChromiumLaunchOptions = Exclude<
  Parameters<BrowserType["launch"]>[0],
  undefined
>;

export type ChromiumContextOptions = Exclude<
  Parameters<Browser["newContext"]>[0],
  undefined
>;

const BROWSER_LAUNCH_KEYS = new Set<string>([
  "args",
  "channel",
  "chromiumSandbox",
  "downloadsPath",
  "env",
  "executablePath",
  "firefoxUserPrefs",
  "handleSIGHUP",
  "handleSIGINT",
  "handleSIGTERM",
  "ignoreAllDefaultArgs",
  "ignoreDefaultArgs",
  "proxy",
  "slowMo",
  "timeout",
  "tracesDir",
]);

const CONTEXT_KEYS = new Set<string>([
  "acceptDownloads",
  "baseURL",
  "bypassCSP",
  "clientCertificates",
  "colorScheme",
  "contrast",
  "deviceScaleFactor",
  "extraHTTPHeaders",
  "forcedColors",
  "geolocation",
  "hasTouch",
  "httpCredentials",
  "ignoreHTTPSErrors",
  "isMobile",
  "javaScriptEnabled",
  "locale",
  "offline",
  "permissions",
  "proxy",
  "recordHar",
  "recordVideo",
  "reducedMotion",
  "screen",
  "serviceWorkers",
  "storageState",
  "strictSelectors",
  "timezoneId",
  "userAgent",
  "viewport",
]);

export function splitPersistentLaunchOptions(
  input: PersistentLaunchOptions,
): {
  browserLaunchOptions: ChromiumLaunchOptions;
  contextOptions: ChromiumContextOptions;
} {
  const browserLaunchOptions: ChromiumLaunchOptions = {};
  const contextOptions: ChromiumContextOptions = {};

  const entries = Object.entries(input) as Array<
    [keyof PersistentLaunchOptions, PersistentLaunchOptions[keyof PersistentLaunchOptions]]
  >;

  for (const [key, value] of entries) {
    if (value === undefined) {
      continue;
    }

    if (BROWSER_LAUNCH_KEYS.has(key as string)) {
      (
        browserLaunchOptions as Record<string, unknown>
      )[key as string] = value;
      continue;
    }

    if (CONTEXT_KEYS.has(key as string)) {
      (
        contextOptions as Record<string, unknown>
      )[key as string] = value;
    }
  }

  return {
    browserLaunchOptions,
    contextOptions,
  };
}
