import type { Page } from "playwright";

import type { ResolvedGeminiWebClientOptions } from "../config/defaults";
import type { GeminiSelectorRegistry } from "../selectors/selectors";
import type { AuthState } from "../session/AuthState";
import type { BrowserSession } from "../session/BrowserSession";
import type { LoggerLike } from "../types/public";

import { GeminiWebError } from "../errors/GeminiWebError";
import { waitForFirstLocator } from "../selectors/selectors";
import { Waiters } from "../stability/Waiters";
import { log } from "../telemetry/Logger";

export class GeminiNavigator {
  constructor(
    private readonly session: BrowserSession,
    private readonly authState: AuthState,
    private readonly waiters: Waiters,
    private readonly selectors: GeminiSelectorRegistry,
    private readonly options: ResolvedGeminiWebClientOptions,
    private readonly logger: LoggerLike,
  ) {}

  async gotoHome(): Promise<Page> {
    const page = await this.session.getPage();

    await page.goto(this.options.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: this.options.defaultTimeoutMs,
    });

    log(this.logger, "debug", "navigation_home", {
      url: page.url(),
    });

    return page;
  }

  async ensureReady(timeoutMs: number): Promise<Page> {
    const page = await this.session.getPage();
    let auth = await this.authState.check(page);

    if (!auth.ok) {
      await this.gotoHome();
      auth = await this.authState.check(page);

      if (!auth.ok) {
        throw mapAuthFailure(auth.reason);
      }
    }

    await this.waiters.waitForComposerReady(page, timeoutMs);

    log(this.logger, "debug", "navigation_ready", {
      url: page.url(),
      mode: auth.ok ? auth.mode : "unknown",
    });

    return page;
  }

  async startNewChat(timeoutMs: number): Promise<Page> {
    const page = await this.ensureReady(timeoutMs);

    const newChatButton = await waitForFirstLocator(
      page,
      this.selectors.newChatButton,
      {
        state: "visible",
        timeoutMs: Math.min(timeoutMs, 3_000),
        pollIntervalMs: this.options.pollIntervalMs,
      },
    );

    if (newChatButton) {
      const disabled =
        !(await newChatButton.locator.isEnabled().catch(() => false)) ||
        (await newChatButton.locator.getAttribute("aria-disabled")) === "true";

      if (!disabled) {
        await newChatButton.locator.click();
        await this.confirmSignedOutNewChatIfNeeded(page, timeoutMs);
      }
    } else {
      await this.gotoHome();
    }

    await this.waiters.waitForComposerReady(page, timeoutMs);
    return page;
  }

  private async confirmSignedOutNewChatIfNeeded(
    page: Page,
    timeoutMs: number,
  ): Promise<void> {
    const confirmButton = await waitForFirstLocator(
      page,
      this.selectors.newChatConfirmButton,
      {
        state: "visible",
        timeoutMs: Math.min(timeoutMs, 3_000),
        pollIntervalMs: this.options.pollIntervalMs,
      },
    );

    if (!confirmButton) {
      return;
    }

    await confirmButton.locator.click();
    await this.waiters.waitForNoBlockingOverlay(page, timeoutMs);

    log(this.logger, "debug", "navigation_new_chat_confirmed", {
      url: page.url(),
    });
  }
}

function mapAuthFailure(reason: "not_logged_in" | "checkpoint" | "unknown"): GeminiWebError {
  if (reason === "not_logged_in") {
    return new GeminiWebError("A logged in Google session is required", {
      code: "AUTH_REQUIRED",
      phase: "auth_check",
      retryable: false,
    });
  }

  if (reason === "checkpoint") {
    return new GeminiWebError("Google requested additional verification", {
      code: "CHECKPOINT_REQUIRED",
      phase: "auth_check",
      retryable: false,
    });
  }

  return new GeminiWebError("Could not verify Gemini auth state", {
    code: "AUTH_REQUIRED",
    phase: "auth_check",
    retryable: true,
  });
}
