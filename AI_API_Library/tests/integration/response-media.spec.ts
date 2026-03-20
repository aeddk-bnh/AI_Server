import { expect, test } from "@playwright/test";

import { resolveClientOptions } from "../../src/config/defaults";
import { ResponseReader } from "../../src/response/ResponseReader";
import { StreamObserver } from "../../src/response/StreamObserver";
import {
  buildAssistantContentSnapshot,
  readLatestAssistantContent,
} from "../../src/response/readLatestAssistantContent";
import { defaultSelectors } from "../../src/selectors/selectors";
import { Waiters } from "../../src/stability/Waiters";
import { NoopLogger } from "../../src/telemetry/Logger";
import type { PromptSubmission } from "../../src/types/internal";
import type { StreamChunk } from "../../src/types/public";

const logger = new NoopLogger();

function createWaiters(stableWindowMs = 25): Waiters {
  return new Waiters(
    defaultSelectors,
    resolveClientOptions({
      userDataDir: ".profiles/test-dom",
      headless: true,
      pollIntervalMs: 10,
      stableWindowMs,
      logger,
      screenshotsOnError: false,
      artifactsDir: "playwright-artifacts/test-dom",
    }),
    logger,
  );
}

function createStreamObserver(
  options: {
    pollIntervalMs?: number;
    stableWindowMs?: number;
  } = {},
): StreamObserver {
  return new StreamObserver(
    defaultSelectors,
    createWaiters(options.stableWindowMs ?? 25),
    resolveClientOptions({
      userDataDir: ".profiles/test-dom",
      headless: true,
      pollIntervalMs: options.pollIntervalMs ?? 10,
      stableWindowMs: options.stableWindowMs ?? 25,
      logger,
      screenshotsOnError: false,
      artifactsDir: "playwright-artifacts/test-dom",
    }),
    logger,
  );
}

function createSubmission(
  overrides: Partial<PromptSubmission> = {},
): PromptSubmission {
  return {
    requestId: "req_test",
    startedAt: new Date().toISOString(),
    assistantCountBefore: 0,
    assistantSnapshotBefore: buildAssistantContentSnapshot("", []),
    userCountBefore: 0,
    promptLength: 12,
    ...overrides,
  };
}

test("classifies mixed assistant content with text, image, and video", async ({
  page,
}) => {
  await page.setContent(`
    <model-response>
      <message-content>
        <div aria-live="polite" aria-busy="false">
          <p>Hello from Gemini</p>
          <div class="attachment-container generated-images">
            <img src="https://example.com/generated.png" alt="Generated image">
          </div>
          <video src="https://example.com/generated.mp4" poster="https://example.com/poster.png"></video>
        </div>
      </message-content>
    </model-response>
  `);

  const snapshot = await readLatestAssistantContent(page, defaultSelectors);

  expect(snapshot.kind).toBe("mixed");
  expect(snapshot.text).toContain("Hello from Gemini");
  expect(snapshot.media).toHaveLength(2);
  expect(snapshot.media.map((item) => item.kind).sort()).toEqual([
    "image",
    "video",
  ]);
});

test("response reader accepts media-only replies", async ({ page }) => {
  await page.setContent(`
    <model-response>
      <message-content>
        <div aria-live="polite" aria-busy="false">
          <div class="attachment-container generated-images">
            <generated-image>
              <single-image class="generated-image large">
                <div class="image-container">
                  <button class="image-button">
                    <img src="https://example.com/generated-only.png" alt="Generated image">
                  </button>
                </div>
              </single-image>
            </generated-image>
          </div>
        </div>
      </message-content>
    </model-response>
  `);

  const reader = new ResponseReader(defaultSelectors, createWaiters(), logger);
  const result = await reader.waitForFinalResponse(page, {
    submission: createSubmission(),
    timeoutMs: 1_000,
  });

  expect(result.kind).toBe("image");
  expect(result.text).toBe("");
  expect(result.media).toHaveLength(1);
  expect(result.media[0]?.url).toBe("https://example.com/generated-only.png");
});

test("stream observer completes mixed replies and emits final media metadata", async ({
  page,
}) => {
  await page.setContent(`
    <model-response>
      <message-content>
        <div aria-live="polite" aria-busy="false">
          <p>Here is your response</p>
          <div class="attachment-container generated-images">
            <img src="https://example.com/generated-mixed.png" alt="Generated mixed image">
          </div>
        </div>
      </message-content>
    </model-response>
  `);

  const observer = createStreamObserver();
  const chunks: StreamChunk[] = [];
  const result = await observer.streamResponse(page, {
    submission: createSubmission(),
    timeoutMs: 1_000,
    onChunk: (chunk) => {
      chunks.push(chunk);
    },
  });

  expect(result.kind).toBe("mixed");
  expect(result.media).toHaveLength(1);
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.at(-1)).toMatchObject({
    done: true,
    kind: "mixed",
  });
});

test("response reader accepts updated content without a new assistant message", async ({
  page,
}) => {
  await page.setContent(`
    <model-response>
      <message-content>
        <div aria-live="polite" aria-busy="false">
          <p>Old answer</p>
        </div>
      </message-content>
    </model-response>
    <button class="send-button stop" aria-label="Stop response"></button>
  `);

  const baseline = buildAssistantContentSnapshot("Old answer", []);
  const reader = new ResponseReader(defaultSelectors, createWaiters(), logger);

  await page.evaluate(() => {
    window.setTimeout(() => {
      const content = document.querySelector("model-response message-content");
      if (content) {
        content.innerHTML = `
          <div aria-live="polite" aria-busy="false">
            <p>New answer</p>
          </div>
        `;
      }

      document.querySelector('button[aria-label="Stop response"]')?.remove();
    }, 50);
  });

  const result = await reader.waitForFinalResponse(page, {
    submission: createSubmission({
      assistantCountBefore: 1,
      assistantSnapshotBefore: baseline,
    }),
    timeoutMs: 1_000,
  });

  expect(result.kind).toBe("text");
  expect(result.text).toContain("New answer");
});

test("stream observer ignores baseline text and completes updated existing response", async ({
  page,
}) => {
  await page.setContent(`
    <model-response>
      <message-content>
        <div aria-live="polite" aria-busy="false">
          <p>Old answer</p>
        </div>
      </message-content>
    </model-response>
    <button class="send-button stop" aria-label="Stop response"></button>
  `);

  const observer = createStreamObserver();
  const chunks: StreamChunk[] = [];

  await page.evaluate(() => {
    window.setTimeout(() => {
      const content = document.querySelector("model-response message-content");
      if (content) {
        content.innerHTML = `
          <div aria-live="polite" aria-busy="false">
            <p>Updated answer</p>
            <img src="https://example.com/updated.png" alt="Updated image">
          </div>
        `;
      }

      document.querySelector('button[aria-label="Stop response"]')?.remove();
    }, 50);
  });

  const result = await observer.streamResponse(page, {
    submission: createSubmission({
      assistantCountBefore: 1,
      assistantSnapshotBefore: buildAssistantContentSnapshot("Old answer", []),
    }),
    timeoutMs: 1_000,
    onChunk: (chunk) => {
      chunks.push(chunk);
    },
  });

  expect(result.kind).toBe("mixed");
  expect(result.text).toContain("Updated answer");
  expect(result.media).toHaveLength(1);
  expect(chunks.some((chunk) => chunk.text.includes("Old answer"))).toBeFalsy();
  expect(chunks.at(-1)).toMatchObject({
    done: true,
    kind: "mixed",
  });
});

test("stream observer emits multiple text deltas for rapid DOM updates", async ({
  page,
}) => {
  await page.setContent(`
    <model-response>
      <message-content>
        <div aria-live="polite" aria-busy="false"></div>
      </message-content>
    </model-response>
    <button class="send-button stop" aria-label="Stop response"></button>
  `);

  const observer = createStreamObserver({
    pollIntervalMs: 200,
    stableWindowMs: 25,
  });
  const chunks: StreamChunk[] = [];

  await page.evaluate(() => {
    window.setTimeout(() => {
      const content = document.querySelector("model-response message-content");
      if (content) {
        content.innerHTML = `
          <div aria-live="polite" aria-busy="false">
            <p>Part one</p>
          </div>
        `;
      }
    }, 200);

    window.setTimeout(() => {
      const content = document.querySelector("model-response message-content");
      if (content) {
        content.innerHTML = `
          <div aria-live="polite" aria-busy="false">
            <p>Part one. Part two</p>
          </div>
        `;
      }
    }, 320);

    window.setTimeout(() => {
      const content = document.querySelector("model-response message-content");
      if (content) {
        content.innerHTML = `
          <div aria-live="polite" aria-busy="false">
            <p>Part one. Part two. Part three</p>
          </div>
        `;
      }
    }, 440);

    window.setTimeout(() => {
      document.querySelector('button[aria-label="Stop response"]')?.remove();
    }, 560);
  });

  const result = await observer.streamResponse(page, {
    submission: createSubmission({
      assistantCountBefore: 1,
      assistantSnapshotBefore: buildAssistantContentSnapshot("", []),
    }),
    timeoutMs: 2_000,
    onChunk: (chunk) => {
      chunks.push(chunk);
    },
  });

  const deltas = chunks
    .filter((chunk) => !chunk.done && chunk.delta.length > 0)
    .map((chunk) => chunk.delta);

  expect(result.text).toContain("Part one. Part two. Part three");
  expect(deltas.length).toBeGreaterThanOrEqual(2);
});
