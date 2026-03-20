import type { Page } from "playwright";

import type { ResolvedGeminiWebClientOptions } from "../config/defaults";
import type { GeminiSelectorRegistry } from "../selectors/selectors";
import type { PromptSubmission } from "../types/internal";
import type {
  GeminiMediaItem,
  GeminiResponseKind,
  LoggerLike,
  StreamChunk,
} from "../types/public";

import { GeminiWebError } from "../errors/GeminiWebError";
import {
  createEmptyAssistantContentSnapshot,
  type AssistantContentSnapshot,
} from "../response/readLatestAssistantContent";
import { StreamDomObserver } from "../response/StreamDomObserver";
import { countMatches } from "../selectors/selectors";
import { Waiters } from "../stability/Waiters";
import { log } from "../telemetry/Logger";

export interface StreamResponseInput {
  submission: PromptSubmission;
  timeoutMs: number;
  onChunk: (chunk: StreamChunk) => void;
}

export interface StreamResponseResult {
  text: string;
  kind: GeminiResponseKind;
  media: GeminiMediaItem[];
  completedAt: string;
}

export class StreamObserver {
  constructor(
    private readonly selectors: GeminiSelectorRegistry,
    private readonly waiters: Waiters,
    private readonly options: ResolvedGeminiWebClientOptions,
    private readonly logger: LoggerLike,
  ) {}

  async streamResponse(
    page: Page,
    input: StreamResponseInput,
  ): Promise<StreamResponseResult> {
    await this.waiters.waitForAssistantResponseStart(page, {
      assistantCountBefore: input.submission.assistantCountBefore,
      assistantSnapshotBefore: input.submission.assistantSnapshotBefore,
      timeoutMs: input.timeoutMs,
    });

    const deadline = Date.now() + input.timeoutMs;
    const baselineSnapshot =
      input.submission.assistantSnapshotBefore ??
      createEmptyAssistantContentSnapshot();
    const domObserver = new StreamDomObserver(page, this.selectors);
    const streamObserverId = `stream:${input.submission.requestId}`;
    const drainIntervalMs = Math.min(this.options.pollIntervalMs, 50);
    let lastSnapshot = baselineSnapshot;
    let stableSince = 0;

    await domObserver.start(streamObserverId, baselineSnapshot.signature);

    try {
      while (Date.now() <= deadline) {
        const { queue, latestSnapshot } = await domObserver.drain(streamObserverId);
        const hasNewAssistantMessage =
          (await this.readAssistantCount(page)) >
          input.submission.assistantCountBefore;

        for (const snapshot of queue) {
          const responseChanged =
            hasNewAssistantMessage ||
            snapshot.signature !== baselineSnapshot.signature;

          if (snapshot.signature === lastSnapshot.signature) {
            continue;
          }

          const delta = computeStreamDelta(lastSnapshot.text, snapshot.text);

          lastSnapshot = snapshot;
          stableSince = Date.now();

          if (responseChanged && snapshot.hasContent && snapshot.kind) {
            input.onChunk({
              text: snapshot.text,
              delta,
              done: false,
              kind: snapshot.kind,
              media: snapshot.media,
            });
          }
        }

        const currentSnapshot =
          queue.at(-1) ?? latestSnapshot ?? createEmptyAssistantContentSnapshot();
        const responseChanged =
          hasNewAssistantMessage ||
          currentSnapshot.signature !== baselineSnapshot.signature;

        if (
          responseChanged &&
          currentSnapshot.hasContent &&
          stableSince === 0
        ) {
          stableSince = Date.now();
        }

        const inProgress = await this.waiters.isGenerationInProgress(page);
        if (
          responseChanged &&
          currentSnapshot.hasContent &&
          currentSnapshot.kind &&
          !inProgress &&
          stableSince > 0 &&
          Date.now() - stableSince >= this.options.stableWindowMs
        ) {
          input.onChunk({
            text: currentSnapshot.text,
            delta: "",
            done: true,
            kind: currentSnapshot.kind,
            media: currentSnapshot.media,
          });

          log(this.logger, "info", "response_stream_completed", {
            requestId: input.submission.requestId,
            textLength: currentSnapshot.text.length,
            responseKind: currentSnapshot.kind,
            mediaCount: currentSnapshot.media.length,
          });

          return {
            text: currentSnapshot.text,
            kind: currentSnapshot.kind,
            media: currentSnapshot.media,
            completedAt: new Date().toISOString(),
          };
        }

        await page.waitForTimeout(drainIntervalMs);
      }
    } finally {
      await domObserver.stop(streamObserverId);
    }

    throw new GeminiWebError("Assistant response stream timed out", {
      code: "RESPONSE_TIMEOUT",
      phase: "response_wait",
      retryable: false,
    });
  }

  private async readLatestAssistantContent(
    page: Page,
  ): Promise<AssistantContentSnapshot> {
    return this.waiters.getLatestAssistantContent(page);
  }

  private async readAssistantCount(page: Page): Promise<number> {
    return countMatches(page, this.selectors.assistantMessages);
  }
}

function computeStreamDelta(previousText: string, currentText: string): string {
  if (!currentText) {
    return "";
  }

  if (!previousText) {
    return currentText;
  }

  if (currentText.startsWith(previousText)) {
    return currentText.slice(previousText.length);
  }

  const sharedPrefixLength = getSharedPrefixLength(previousText, currentText);
  if (sharedPrefixLength > 0) {
    return currentText.slice(sharedPrefixLength);
  }

  return "";
}

function getSharedPrefixLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;

  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }

  return index;
}
