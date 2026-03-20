import {
  type Browser,
  chromium as playwrightChromium,
  type BrowserContext,
  type BrowserType,
} from "playwright";
import { addExtra } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import type {
  ResolvedGeminiStealthOptions,
  ResolvedGeminiWebClientOptions,
} from "../config/defaults";
import {
  splitPersistentLaunchOptions,
  type ChromiumContextOptions,
  type ChromiumLaunchOptions,
} from "../session/LaunchOptions";
import { log } from "../telemetry/Logger";
import type { LoggerLike } from "../types/public";

type PersistentContextLaunchOptions = Omit<
  Exclude<Parameters<BrowserType["launchPersistentContext"]>[1], undefined>,
  "headless"
>;

interface ChromiumLauncher {
  launchPersistentContext: typeof playwrightChromium.launchPersistentContext;
  launch: typeof playwrightChromium.launch;
}

export interface ChromiumSessionStrategy {
  launcher: ChromiumLauncher;
  launchOptions: PersistentContextLaunchOptions;
  recycleInitialPages: boolean;
  afterContextLaunched(context: BrowserContext): Promise<void>;
}

export interface ChromiumBrowserStrategy {
  launcher: ChromiumLauncher;
  launchOptions: ChromiumLaunchOptions;
  contextOptions: ChromiumContextOptions;
  afterContextLaunched(context: BrowserContext): Promise<void>;
}

const AUTOMATION_DISABLE_FLAG = "--disable-blink-features=AutomationControlled";
const ENABLE_AUTOMATION_ARG = "--enable-automation";

export function createChromiumSessionStrategy(
  options: ResolvedGeminiWebClientOptions,
  logger: LoggerLike,
): ChromiumSessionStrategy {
  const launchOptions = mergeStealthLaunchOptions(options);

  if (!options.stealth.enabled) {
    return {
      launcher: playwrightChromium,
      launchOptions,
      recycleInitialPages: false,
      async afterContextLaunched(): Promise<void> {},
    };
  }

  const launcher = createChromiumLauncherWithStealth(options.stealth, logger);

  return {
    launcher,
    launchOptions,
    recycleInitialPages: options.stealth.recycleInitialPages,
    afterContextLaunched: async (context) => {
      if (options.stealth.webdriverFallback) {
        await applyStealthInitScripts(context, options.stealth);
      }
    },
  };
}

export function createChromiumBrowserStrategy(
  options: ResolvedGeminiWebClientOptions,
  logger: LoggerLike,
): ChromiumBrowserStrategy {
  const launcher = options.stealth.enabled
    ? createChromiumLauncherWithStealth(options.stealth, logger)
    : playwrightChromium;
  const { browserLaunchOptions, contextOptions } = splitPersistentLaunchOptions(
    options.launchOptions,
  );

  return {
    launcher,
    launchOptions: mergeStealthBrowserLaunchOptions(
      browserLaunchOptions,
      options.stealth,
    ),
    contextOptions: mergeStealthContextOptions(contextOptions, options.stealth),
    afterContextLaunched: async (context) => {
      if (options.stealth.enabled && options.stealth.webdriverFallback) {
        await applyStealthInitScripts(context, options.stealth);
      }
    },
  };
}

function createChromiumLauncherWithStealth(
  stealth: ResolvedGeminiStealthOptions,
  logger: LoggerLike,
): ChromiumLauncher {
  if (!stealth.usePlugin) {
    log(logger, "debug", "stealth_launcher_configured", {
      usePlugin: false,
      recycleInitialPages: stealth.recycleInitialPages,
    });
    return playwrightChromium;
  }

  const chromium = addExtra(playwrightChromium);
  const plugin = StealthPlugin();
  const enabledEvasions = resolveEnabledEvasions(plugin, stealth);
  plugin.enabledEvasions = enabledEvasions;

  chromium.use(plugin);

  const userAgentOverrideDefaults = buildUserAgentOverrideDefaults(stealth);
  if (userAgentOverrideDefaults) {
    chromium.plugins.setDependencyDefaults(
      "stealth/evasions/user-agent-override",
      userAgentOverrideDefaults,
    );
  }

  if (stealth.languages?.length) {
    chromium.plugins.setDependencyDefaults(
      "stealth/evasions/navigator.languages",
      {
        languages: [...stealth.languages],
      },
    );
  }

  log(logger, "debug", "stealth_launcher_configured", {
    usePlugin: true,
    enabledEvasions: [...enabledEvasions],
    recycleInitialPages: stealth.recycleInitialPages,
  });

  return chromium as unknown as ChromiumLauncher;
}

function resolveEnabledEvasions(
  plugin: ReturnType<typeof StealthPlugin>,
  stealth: ResolvedGeminiStealthOptions,
): Set<string> {
  const evasions = stealth.enabledEvasions?.length
    ? new Set(stealth.enabledEvasions)
    : new Set(plugin.enabledEvasions);

  for (const evasion of stealth.disabledEvasions ?? []) {
    evasions.delete(evasion);
  }

  return evasions;
}

function buildUserAgentOverrideDefaults(
  stealth: ResolvedGeminiStealthOptions,
): Record<string, unknown> | null {
  const locale = resolveAcceptLanguage(stealth);
  const defaults: Record<string, unknown> = {
    maskLinux: stealth.maskLinux,
  };

  if (stealth.userAgent) {
    defaults.userAgent = stealth.userAgent;
  }

  if (locale) {
    defaults.locale = locale;
  }

  return Object.keys(defaults).length > 0 ? defaults : null;
}

function mergeStealthLaunchOptions(
  options: ResolvedGeminiWebClientOptions,
): PersistentContextLaunchOptions {
  const merged: PersistentContextLaunchOptions = {
    ...options.launchOptions,
  };

  if (!options.stealth.enabled) {
    return merged;
  }

  merged.args = mergeLaunchArgs(options.launchOptions.args, options.stealth);
  const ignoreDefaultArgs = mergeIgnoredDefaultArgs(
    options.launchOptions.ignoreDefaultArgs,
    options.stealth,
  );
  if (ignoreDefaultArgs !== undefined) {
    merged.ignoreDefaultArgs = ignoreDefaultArgs;
  }

  if (!options.launchOptions.locale && options.stealth.locale) {
    merged.locale = options.stealth.locale;
  }

  if (!options.launchOptions.timezoneId && options.stealth.timezoneId) {
    merged.timezoneId = options.stealth.timezoneId;
  }

  if (!options.stealth.usePlugin && !options.launchOptions.userAgent && options.stealth.userAgent) {
    merged.userAgent = options.stealth.userAgent;
  }

  if (
    Object.prototype.hasOwnProperty.call(options.stealth, "viewport") &&
    options.launchOptions.viewport === undefined &&
    options.stealth.viewport !== undefined
  ) {
    merged.viewport = options.stealth.viewport;
  }

  if (options.launchOptions.screen === undefined && options.stealth.screen) {
    merged.screen = options.stealth.screen;
  }

  if (options.stealth.extraHTTPHeaders) {
    merged.extraHTTPHeaders = {
      ...options.stealth.extraHTTPHeaders,
      ...(options.launchOptions.extraHTTPHeaders ?? {}),
    };
  }

  return merged;
}

function mergeStealthBrowserLaunchOptions(
  input: ChromiumLaunchOptions,
  stealth: ResolvedGeminiStealthOptions,
): ChromiumLaunchOptions {
  const merged: ChromiumLaunchOptions = {
    ...input,
  };

  if (!stealth.enabled) {
    return merged;
  }

  merged.args = mergeLaunchArgs(input.args, stealth);

  const ignoreDefaultArgs = mergeIgnoredDefaultArgs(
    input.ignoreDefaultArgs,
    stealth,
  );
  if (ignoreDefaultArgs !== undefined) {
    merged.ignoreDefaultArgs = ignoreDefaultArgs;
  }

  return merged;
}

function mergeStealthContextOptions(
  input: ChromiumContextOptions,
  stealth: ResolvedGeminiStealthOptions,
): ChromiumContextOptions {
  const merged: ChromiumContextOptions = {
    ...input,
  };

  if (!stealth.enabled) {
    return merged;
  }

  if (!input.locale && stealth.locale) {
    merged.locale = stealth.locale;
  }

  if (!input.timezoneId && stealth.timezoneId) {
    merged.timezoneId = stealth.timezoneId;
  }

  if (!stealth.usePlugin && !input.userAgent && stealth.userAgent) {
    merged.userAgent = stealth.userAgent;
  }

  if (
    Object.prototype.hasOwnProperty.call(stealth, "viewport") &&
    input.viewport === undefined &&
    stealth.viewport !== undefined
  ) {
    merged.viewport = stealth.viewport;
  }

  if (input.screen === undefined && stealth.screen) {
    merged.screen = stealth.screen;
  }

  if (stealth.extraHTTPHeaders) {
    merged.extraHTTPHeaders = {
      ...stealth.extraHTTPHeaders,
      ...(input.extraHTTPHeaders ?? {}),
    };
  }

  return merged;
}

function mergeLaunchArgs(
  launchArgs: PersistentContextLaunchOptions["args"],
  stealth: ResolvedGeminiStealthOptions,
): string[] {
  const args = new Set(launchArgs ?? []);

  if (stealth.stripAutomationFlags) {
    ensureAutomationControlledFlag(args);
  }

  for (const arg of stealth.launchArgs) {
    args.add(arg);
  }

  return [...args];
}

function mergeIgnoredDefaultArgs(
  ignoreDefaultArgs: PersistentContextLaunchOptions["ignoreDefaultArgs"],
  stealth: ResolvedGeminiStealthOptions,
): boolean | string[] | undefined {
  if (ignoreDefaultArgs === true) {
    return true;
  }

  const ignored = new Set(Array.isArray(ignoreDefaultArgs) ? ignoreDefaultArgs : []);

  if (stealth.stripAutomationFlags) {
    ignored.add(ENABLE_AUTOMATION_ARG);
  }

  for (const arg of stealth.ignoreDefaultArgs) {
    ignored.add(arg);
  }

  if (ignored.size === 0) {
    return undefined;
  }

  return [...ignored];
}

function ensureAutomationControlledFlag(args: Set<string>): void {
  const existingFlag = [...args].find((arg) =>
    arg.startsWith("--disable-blink-features="),
  );

  if (!existingFlag) {
    args.add(AUTOMATION_DISABLE_FLAG);
    return;
  }

  if (existingFlag.includes("AutomationControlled")) {
    return;
  }

  args.delete(existingFlag);
  args.add(`${existingFlag},AutomationControlled`);
}

async function applyStealthInitScripts(
  context: BrowserContext,
  stealth: ResolvedGeminiStealthOptions,
): Promise<void> {
  const languages = stealth.languages?.length
    ? [...stealth.languages]
    : resolveNavigatorLanguages(stealth.locale);

  await context.addInitScript(({ languages }) => {
    try {
      const navigatorPrototype = Object.getPrototypeOf(navigator);
      Object.defineProperty(navigatorPrototype, "webdriver", {
        configurable: true,
        get: () => undefined,
      });
    } catch {}

    if (Array.isArray(languages) && languages.length > 0) {
      try {
        const navigatorPrototype = Object.getPrototypeOf(navigator);
        Object.defineProperty(navigatorPrototype, "languages", {
          configurable: true,
          get: () => Object.freeze([...languages]),
        });
      } catch {}
    }
  }, {
    languages,
  });
}

function resolveAcceptLanguage(
  stealth: ResolvedGeminiStealthOptions,
): string | undefined {
  if (stealth.languages?.length) {
    return stealth.languages.join(",");
  }

  if (!stealth.locale) {
    return undefined;
  }

  const primaryLanguage = stealth.locale.split("-")[0];
  return primaryLanguage && primaryLanguage !== stealth.locale
    ? `${stealth.locale},${primaryLanguage}`
    : stealth.locale;
}

function resolveNavigatorLanguages(locale?: string): string[] | undefined {
  if (!locale) {
    return undefined;
  }

  const primaryLanguage = locale.split("-")[0];
  return primaryLanguage && primaryLanguage !== locale
    ? [locale, primaryLanguage]
    : [locale];
}
