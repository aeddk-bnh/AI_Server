import type { Page } from "playwright";

import type { GeminiSelectorRegistry } from "../selectors/selectors";
import type { LoggerLike } from "../types/public";

import { hasVisibleMatch } from "../selectors/selectors";
import { log } from "../telemetry/Logger";

export type AuthStatus =
  | { ok: true; mode: "authenticated" | "guest" }
  | { ok: false; reason: "not_logged_in" | "checkpoint" | "unknown" };

export class AuthState {
  constructor(
    private readonly selectors: GeminiSelectorRegistry,
    private readonly logger: LoggerLike,
  ) {}

  async check(page: Page): Promise<AuthStatus> {
    const url = page.url();
    const title = await page.title().catch(() => "");

    if (looksLikeLoginUrl(url) || /sign in/i.test(title)) {
      log(this.logger, "debug", "auth_checked", {
        ok: false,
        reason: "not_logged_in",
        url,
      });

      return { ok: false, reason: "not_logged_in" };
    }

    if (await this.hasCheckpointSignal(page)) {
      log(this.logger, "debug", "auth_checked", {
        ok: false,
        reason: "checkpoint",
        url,
      });

      return { ok: false, reason: "checkpoint" };
    }

    const composerVisible = await hasVisibleMatch(page, this.selectors.composer);
    const appShellVisible = await hasVisibleMatch(page, this.selectors.appShell);

    if (composerVisible || appShellVisible) {
      const isGuest =
        (await hasVisibleMatch(page, this.selectors.signInButtons)) ||
        (await hasVisibleMatch(page, this.selectors.signedOutMarkers));

      log(this.logger, "debug", "auth_checked", {
        ok: true,
        mode: isGuest ? "guest" : "authenticated",
        url,
      });

      return { ok: true, mode: isGuest ? "guest" : "authenticated" };
    }

    log(this.logger, "debug", "auth_checked", {
      ok: false,
      reason: "unknown",
      url,
    });

    return { ok: false, reason: "unknown" };
  }

  private async hasCheckpointSignal(page: Page): Promise<boolean> {
    const checkpointHints = [
      "text=/verify it's you/i",
      "text=/verify your identity/i",
      "text=/2-step verification/i",
      'input[type="password"]',
    ];

    for (const selector of checkpointHints) {
      const count = await page.locator(selector).count().catch(() => 0);
      if (count > 0) {
        return true;
      }
    }

    return false;
  }
}

function looksLikeLoginUrl(url: string): boolean {
  return (
    url.includes("accounts.google.com") ||
    url.includes("ServiceLogin") ||
    url.includes("/signin/")
  );
}
