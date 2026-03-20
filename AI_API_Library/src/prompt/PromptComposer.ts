import type { Locator, Page } from "playwright";

import type { GeminiSelectorRegistry } from "../selectors/selectors";
import type { PromptSubmission, RequestContext } from "../types/internal";
import type { LoggerLike } from "../types/public";

import { GeminiWebError } from "../errors/GeminiWebError";
import { countMatches, waitForFirstLocator } from "../selectors/selectors";
import { Waiters } from "../stability/Waiters";
import { log } from "../telemetry/Logger";

export class PromptComposer {
  constructor(
    private readonly selectors: GeminiSelectorRegistry,
    private readonly waiters: Waiters,
    private readonly pollIntervalMs: number,
    private readonly logger: LoggerLike,
  ) {}

  async sendPrompt(
    page: Page,
    prompt: string,
    context: RequestContext,
  ): Promise<PromptSubmission> {
    if (!prompt.trim()) {
      throw new GeminiWebError("Prompt must not be empty", {
        code: "SUBMIT_FAILED",
        phase: "compose",
        retryable: false,
      });
    }

    const composer = await this.waiters.waitForComposerReady(page, context.timeoutMs);
    const assistantCountBefore = await countMatches(
      page,
      this.selectors.assistantMessages,
    );
    const assistantSnapshotBefore =
      await this.waiters.getLatestAssistantContent(page);
    const userCountBefore = await countMatches(page, this.selectors.userMessages);

    await this.writePrompt(page, composer.locator, prompt);
    await this.submitPrompt(page, context.timeoutMs);
    await this.waiters.waitForSubmissionAccepted(page, {
      userCountBefore,
      assistantCountBefore,
      timeoutMs: context.timeoutMs,
    });

    log(this.logger, "info", "prompt_submitted", {
      requestId: context.requestId,
      selector: composer.selector,
      promptLength: prompt.length,
    });

    return {
      requestId: context.requestId,
      startedAt: context.startedAt,
      assistantCountBefore,
      assistantSnapshotBefore,
      userCountBefore,
      promptLength: prompt.length,
    };
  }

  private async writePrompt(
    page: Page,
    locator: Locator,
    prompt: string,
  ): Promise<void> {
    let currentLocator = locator;
    const maxAttempts = 4;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const wrotePrompt = await this.tryWritePrompt(
        page,
        currentLocator,
        prompt,
      );

      if (wrotePrompt) {
        return;
      }

      if (attempt >= maxAttempts - 1) {
        break;
      }

      await page.waitForTimeout(Math.min(this.pollIntervalMs, 250));
      const refreshedComposer = await this.waiters.waitForComposerReady(
        page,
        5_000,
      );
      currentLocator = refreshedComposer.locator;
    }

    throw new GeminiWebError("Could not write prompt to composer", {
      code: "COMPOSER_NOT_FOUND",
      phase: "compose",
      retryable: true,
    });
  }

  private async tryWritePrompt(
    page: Page,
    locator: Locator,
    prompt: string,
  ): Promise<boolean> {
    const targetKind = await locator
      .evaluate((element) => ({
        tagName: element.tagName.toLowerCase(),
        isContentEditable:
          element instanceof HTMLElement ? element.isContentEditable : false,
      }))
      .catch(() => null);

    if (!targetKind) {
      return false;
    }

    if (
      targetKind.tagName === "textarea" ||
      targetKind.tagName === "input"
    ) {
      const filled = await locator
        .fill(prompt)
        .then(() => true)
        .catch(() => false);

      if (!filled) {
        return false;
      }

      return this.composerHasPrompt(locator, prompt);
    }

    if (targetKind.isContentEditable) {
      const focused = await locator
        .focus()
        .then(() => true)
        .catch(() => false);
      const clicked = focused
        ? true
        : await locator
            .click()
            .then(() => true)
            .catch(() => false);

      if (!clicked) {
        return false;
      }

      await page.keyboard.press("Control+A").catch(() => undefined);
      await page.keyboard.press("Backspace").catch(() => undefined);

      const inserted = await page.keyboard
        .insertText(prompt)
        .then(() => true)
        .catch(() => false);

      if (inserted && (await this.composerHasPrompt(locator, prompt))) {
        return true;
      }

      const wroteByDom = await locator
        .evaluate((element, value) => {
          if (!(element instanceof HTMLElement) || !element.isContentEditable) {
            return false;
          }

          element.focus();
          element.textContent = value;
          element.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              data: value,
              inputType: "insertText",
            }),
          );
          element.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, prompt)
        .catch(() => false);

      if (!wroteByDom) {
        return false;
      }

      return this.composerHasPrompt(locator, prompt);
    }

    return false;
  }

  private async composerHasPrompt(
    locator: Locator,
    prompt: string,
  ): Promise<boolean> {
    const expected = normalizeComposerValue(prompt);
    const currentValue = await locator
      .evaluate((element) => {
        if (element instanceof HTMLTextAreaElement) {
          return element.value;
        }

        if (element instanceof HTMLInputElement) {
          return element.value;
        }

        if (element instanceof HTMLElement && element.isContentEditable) {
          return element.innerText || element.textContent || "";
        }

        return "";
      })
      .catch(() => "");

    return normalizeComposerValue(currentValue) === expected;
  }

  private async submitPrompt(page: Page, timeoutMs: number): Promise<void> {
    const sendButton = await waitForFirstLocator(page, this.selectors.sendButton, {
      state: "visible",
      timeoutMs: Math.min(timeoutMs, 2_000),
      pollIntervalMs: this.pollIntervalMs,
    });

    if (sendButton && (await sendButton.locator.isEnabled().catch(() => true))) {
      await sendButton.locator.click();
      return;
    }

    for (const shortcut of ["Enter", "Control+Enter"]) {
      try {
        await page.keyboard.press(shortcut);
        return;
      } catch {
        continue;
      }
    }

    throw new GeminiWebError("Could not submit prompt", {
      code: sendButton ? "SUBMIT_FAILED" : "SEND_BUTTON_NOT_FOUND",
      phase: "submit",
      retryable: true,
    });
  }
}

function normalizeComposerValue(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
