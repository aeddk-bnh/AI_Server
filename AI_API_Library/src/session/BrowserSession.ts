import path from "node:path";
import { mkdir } from "node:fs/promises";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import type { ResolvedGeminiWebClientOptions } from "../config/defaults";
import type { GeminiSessionInfo, LoggerLike } from "../types/public";

import { GeminiWebError } from "../errors/GeminiWebError";
import {
  createChromiumBrowserStrategy,
  createChromiumSessionStrategy,
} from "../stealth/Stealth";
import { log } from "../telemetry/Logger";

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private closeMode: "persistent-context" | "launched-browser" | "cdp-browser" =
    "persistent-context";
  private sessionInfo: GeminiSessionInfo | null = null;

  constructor(
    private readonly options: ResolvedGeminiWebClientOptions,
    private readonly logger: LoggerLike,
  ) {}

  async open(): Promise<void> {
    if (this.context) {
      return;
    }

    try {
      if (this.options.browserConnection.cdpEndpointURL) {
        try {
          await this.openConnectedBrowserSession();
        } catch (error) {
          if (!this.options.authState.storageStatePath || !isRecoverableCdpError(error)) {
            throw error;
          }

          log(this.logger, "warn", "cdp_attach_failed_fallback_storage_state", {
            endpointURL: this.options.browserConnection.cdpEndpointURL,
            storageStatePath: this.options.authState.storageStatePath,
            reason: error instanceof Error ? error.message : "unknown_error",
          });

          await this.disposeTransientBrowser();
          await this.openStorageStateSession(true);
        }
      } else if (this.options.authState.storageStatePath) {
        await this.openStorageStateSession();
      } else {
        await this.openPersistentSession();
      }
    } catch (error) {
      throw new GeminiWebError("Failed to open browser session", {
        code: "PAGE_BROKEN",
        phase: "session_open",
        retryable: false,
        cause: error,
      });
    }
  }

  async getPage(): Promise<Page> {
    await this.open();

    if (!this.context) {
      throw new GeminiWebError("Browser context is not available", {
        code: "PAGE_BROKEN",
        phase: "session_open",
      });
    }

    if (!this.page || this.page.isClosed()) {
      this.page = await this.pickPrimaryPage(false);
    }

    return this.page;
  }

  isOpen(): boolean {
    return this.context !== null;
  }

  getSessionInfo(): GeminiSessionInfo | null {
    return this.sessionInfo ? { ...this.sessionInfo } : null;
  }

  async close(): Promise<void> {
    if (!this.context && !this.browser) {
      return;
    }

    try {
      await this.closeResources();
      log(this.logger, "info", "session_closed", {
        mode: this.closeMode,
      });
    } catch (error) {
      throw new GeminiWebError("Failed to close browser session", {
        code: "PAGE_BROKEN",
        phase: "close",
        retryable: false,
        cause: error,
      });
    } finally {
      this.browser = null;
      this.context = null;
      this.page = null;
      this.closeMode = "persistent-context";
      this.sessionInfo = null;
    }
  }

  async saveStorageState(
    filePath: string,
    indexedDB = this.options.authState.indexedDB,
  ): Promise<string> {
    await this.open();

    if (!this.context) {
      throw new GeminiWebError("Browser context is not available", {
        code: "PAGE_BROKEN",
        phase: "auth_check",
      });
    }

    const resolvedPath = path.resolve(filePath);
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await this.context.storageState({
      path: resolvedPath,
      indexedDB,
    });

    log(this.logger, "info", "auth_state_saved", {
      path: resolvedPath,
      indexedDB,
      mode: this.closeMode,
    });

    return resolvedPath;
  }

  private async pickPrimaryPage(recycleInitialPages: boolean): Promise<Page> {
    if (!this.context) {
      throw new GeminiWebError("Browser context is not initialized", {
        code: "PAGE_BROKEN",
        phase: "session_open",
      });
    }

    const existingPages = this.context.pages().filter((page) => !page.isClosed());

    if (recycleInitialPages && existingPages.length > 0) {
      try {
        const replacementPage = await this.context.newPage();
        const stalePages = existingPages.filter((page) => page !== replacementPage);

        await Promise.all(stalePages.map((page) => page.close().catch(() => undefined)));
        return replacementPage;
      } catch (error) {
        log(this.logger, "warn", "stealth_recycle_skipped", {
          reason: error instanceof Error ? error.message : "unknown_error",
          existingPageCount: existingPages.length,
        });
        const fallbackPage = existingPages[0];
        if (fallbackPage) {
          return fallbackPage;
        }

        return this.context.newPage();
      }
    }

    return existingPages[0] ?? this.context.newPage();
  }

  private async openPersistentSession(): Promise<void> {
    const strategy = createChromiumSessionStrategy(this.options, this.logger);

    this.context = await strategy.launcher.launchPersistentContext(
      this.options.userDataDir,
      {
        headless: this.options.headless,
        ...strategy.launchOptions,
      },
    );
    this.closeMode = "persistent-context";

    await this.finalizeSessionOpen({
      recycleInitialPages: strategy.recycleInitialPages,
      sessionDetails: this.createSessionInfo({
        mode: "persistent-context",
        userDataDir: this.options.userDataDir,
      }),
      afterContextLaunched: () => strategy.afterContextLaunched(this.context!),
    });
  }

  private async openStorageStateSession(
    fallbackFromCdp = false,
  ): Promise<void> {
    const strategy = createChromiumBrowserStrategy(this.options, this.logger);
    this.browser = await strategy.launcher.launch({
      headless: this.options.headless,
      ...strategy.launchOptions,
    });
    this.closeMode = "launched-browser";

    this.context = await this.browser.newContext({
      ...strategy.contextOptions,
      ...(this.options.authState.storageStatePath
        ? { storageState: this.options.authState.storageStatePath }
        : {}),
    });

    await this.finalizeSessionOpen({
      recycleInitialPages: false,
      sessionDetails: this.createSessionInfo({
        mode: "storage-state",
        fallbackFromCdp,
        ...(this.options.authState.storageStatePath
          ? { storageStatePath: this.options.authState.storageStatePath }
          : {}),
      }),
      afterContextLaunched: () => strategy.afterContextLaunched(this.context!),
    });
  }

  private async openConnectedBrowserSession(): Promise<void> {
    const endpointURL = this.options.browserConnection.cdpEndpointURL;
    if (!endpointURL) {
      throw new GeminiWebError("CDP endpoint URL is missing", {
        code: "PAGE_BROKEN",
        phase: "session_open",
      });
    }

    this.browser = await chromium.connectOverCDP(endpointURL, {
      ...(this.options.browserConnection.headers
        ? { headers: this.options.browserConnection.headers }
        : {}),
      ...(typeof this.options.browserConnection.timeoutMs === "number"
        ? { timeout: this.options.browserConnection.timeoutMs }
        : {}),
    });
    this.closeMode = "cdp-browser";

    const existingContexts = this.browser.contexts();
    this.context = existingContexts[0] ?? null;

    if (!this.context) {
      throw new GeminiWebError("No browser context is available via CDP", {
        code: "PAGE_BROKEN",
        phase: "session_open",
      });
    }

    await this.finalizeSessionOpen({
      recycleInitialPages: false,
      sessionDetails: this.createSessionInfo({
        mode: "cdp-browser",
        cdpEndpointURL: endpointURL,
      }),
    });
  }

  private async finalizeSessionOpen(args: {
    recycleInitialPages: boolean;
    sessionDetails: GeminiSessionInfo;
    afterContextLaunched?: () => Promise<void>;
  }): Promise<void> {
    if (!this.context) {
      throw new GeminiWebError("Browser context is not available", {
        code: "PAGE_BROKEN",
        phase: "session_open",
      });
    }

    if (args.afterContextLaunched) {
      await args.afterContextLaunched();
    }

    this.context.setDefaultTimeout(this.options.defaultTimeoutMs);
    this.page = await this.pickPrimaryPage(args.recycleInitialPages);
    this.sessionInfo = {
      ...args.sessionDetails,
    };

    log(this.logger, "info", "session_opened", {
      ...args.sessionDetails,
    });
  }

  private async closeResources(): Promise<void> {
    if (this.closeMode === "persistent-context") {
      if (this.context) {
        await this.context.close();
      }
      return;
    }

    if (this.closeMode === "launched-browser") {
      if (this.browser) {
        await this.browser.close();
        return;
      }

      if (this.context) {
        await this.context.close();
      }
      return;
    }

    if (this.browser) {
      await this.browser.close();
      return;
    }

    if (this.context) {
      await this.context.close();
    }
  }

  private async disposeTransientBrowser(): Promise<void> {
    try {
      if (this.closeMode === "launched-browser" || this.closeMode === "cdp-browser") {
        await this.browser?.close().catch(() => undefined);
      } else {
        await this.context?.close().catch(() => undefined);
      }
    } finally {
      this.browser = null;
      this.context = null;
      this.page = null;
      this.closeMode = "persistent-context";
      this.sessionInfo = null;
    }
  }

  private createSessionInfo(
    input: Omit<GeminiSessionInfo, "headless" | "stealth" | "fallbackFromCdp"> &
      Partial<Pick<GeminiSessionInfo, "fallbackFromCdp">>,
  ): GeminiSessionInfo {
    return {
      headless: this.options.headless,
      stealth: this.options.stealth.enabled,
      fallbackFromCdp: input.fallbackFromCdp ?? false,
      ...input,
    };
  }
}

function isRecoverableCdpError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    /connect\s+econnrefused/i.test(message) ||
    /connect\s+etimedout/i.test(message) ||
    /connectovercdp/i.test(message) ||
    /retrieving websocket url/i.test(message)
  );
}
