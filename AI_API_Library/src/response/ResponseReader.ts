import type { Page } from "playwright";

import type { GeminiSelectorRegistry } from "../selectors/selectors";
import type { PromptSubmission } from "../types/internal";
import type {
  GeminiMediaItem,
  GeminiResponseKind,
  LoggerLike,
} from "../types/public";

import { GeminiWebError } from "../errors/GeminiWebError";
import { countMatches } from "../selectors/selectors";
import { Waiters } from "../stability/Waiters";
import { log } from "../telemetry/Logger";

import { readLatestAssistantText } from "./readLatestAssistantText";

export interface FinalResponseInput {
  submission: PromptSubmission;
  timeoutMs: number;
}

export interface FinalResponseResult {
  text: string;
  kind: GeminiResponseKind;
  media: GeminiMediaItem[];
  completedAt: string;
}

export class ResponseReader {
  constructor(
    private readonly selectors: GeminiSelectorRegistry,
    private readonly waiters: Waiters,
    private readonly logger: LoggerLike,
  ) {}

  async waitForFinalResponse(
    page: Page,
    input: FinalResponseInput,
  ): Promise<FinalResponseResult> {
    await this.waiters.waitForAssistantResponseStart(page, {
      assistantCountBefore: input.submission.assistantCountBefore,
      assistantSnapshotBefore: input.submission.assistantSnapshotBefore,
      timeoutMs: input.timeoutMs,
    });

    const content = await this.waiters.waitForAssistantResponseComplete(page, {
      assistantCountBefore: input.submission.assistantCountBefore,
      assistantSnapshotBefore: input.submission.assistantSnapshotBefore,
      timeoutMs: input.timeoutMs,
    });
    if (!content.hasContent || !content.kind) {
      throw new GeminiWebError("Assistant response was empty", {
        code: "RESPONSE_NOT_FOUND",
        phase: "response_read",
        retryable: false,
      });
    }

    const assistantCount = await countMatches(page, this.selectors.assistantMessages);
    const responseChanged =
      assistantCount > input.submission.assistantCountBefore ||
      content.signature !== input.submission.assistantSnapshotBefore.signature;
    if (!responseChanged) {
      throw new GeminiWebError("Could not locate a new assistant response", {
        code: "RESPONSE_NOT_FOUND",
        phase: "response_read",
        retryable: false,
      });
    }

    const result = {
      text: content.text,
      kind: content.kind,
      media: content.media,
      completedAt: new Date().toISOString(),
    };

    log(this.logger, "info", "response_completed", {
      requestId: input.submission.requestId,
      textLength: result.text.length,
      responseKind: result.kind,
      mediaCount: result.media.length,
    });

    return result;
  }

  async extractLatestAssistantText(page: Page): Promise<string> {
    return readLatestAssistantText(page, this.selectors);
  }
}
