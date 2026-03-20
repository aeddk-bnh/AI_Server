import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { resolveClientOptions } from "../../src/config/defaults";
import { BrowserSession } from "../../src/session/BrowserSession";
import { NoopLogger } from "../../src/telemetry/Logger";

const logger = new NoopLogger();

test("browser session can launch from storage state and export it again", async ({
  }, testInfo) => {
  const outputDir = testInfo.outputPath("auth-state");
  const storageStatePath = path.join(outputDir, "input-state.json");
  const exportedStatePath = path.join(outputDir, "exported-state.json");

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    storageStatePath,
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin: "https://example.com",
            localStorage: [
              {
                name: "gemini-auth-probe",
                value: "ready",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const session = new BrowserSession(
    resolveClientOptions({
      userDataDir: ".profiles/test-storage-state",
      headless: true,
      logger,
      screenshotsOnError: false,
      artifactsDir: "playwright-artifacts/test-storage-state",
      authState: {
        storageStatePath,
      },
    }),
    logger,
  );

  try {
    await session.open();
    const page = await session.getPage();
    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded",
    });

    const storageValue = await page.evaluate(() =>
      window.localStorage.getItem("gemini-auth-probe"),
    );
    expect(storageValue).toBe("ready");

    const savedPath = await session.saveStorageState(exportedStatePath, true);
    expect(savedPath).toBe(path.resolve(exportedStatePath));

    const savedState = JSON.parse(await readFile(savedPath, "utf8")) as {
      origins?: Array<{
        origin: string;
        localStorage?: Array<{ name: string; value: string }>;
      }>;
    };

    expect(
      savedState.origins?.some(
        (origin) =>
          origin.origin === "https://example.com" &&
          origin.localStorage?.some(
            (entry) =>
              entry.name === "gemini-auth-probe" &&
              entry.value === "ready",
          ),
      ),
    ).toBeTruthy();
  } finally {
    await session.close();
  }
});

test("browser session falls back to storage state when CDP endpoint is unavailable", async ({
  }, testInfo) => {
  const outputDir = testInfo.outputPath("auth-state-cdp-fallback");
  const storageStatePath = path.join(outputDir, "input-state.json");

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    storageStatePath,
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin: "https://example.com",
            localStorage: [
              {
                name: "gemini-auth-probe-fallback",
                value: "storage-state-ok",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const session = new BrowserSession(
    resolveClientOptions({
      userDataDir: ".profiles/test-storage-state-fallback",
      headless: true,
      logger,
      screenshotsOnError: false,
      artifactsDir: "playwright-artifacts/test-storage-state-fallback",
      browserConnection: {
        cdpEndpointURL: "http://127.0.0.1:9222",
        timeoutMs: 500,
      },
      authState: {
        storageStatePath,
      },
    }),
    logger,
  );

  try {
    await session.open();
    const page = await session.getPage();
    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded",
    });

    const storageValue = await page.evaluate(() =>
      window.localStorage.getItem("gemini-auth-probe-fallback"),
    );
    expect(storageValue).toBe("storage-state-ok");
  } finally {
    await session.close();
  }
});
