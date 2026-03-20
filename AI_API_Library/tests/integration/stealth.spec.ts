import { expect, test } from "@playwright/test";

import { resolveClientOptions } from "../../src/config/defaults";
import { BrowserSession } from "../../src/session/BrowserSession";
import { NoopLogger } from "../../src/telemetry/Logger";

const logger = new NoopLogger();

test("browser session applies stealth strategy to persistent contexts", async () => {
  const session = new BrowserSession(
    resolveClientOptions({
      userDataDir: ".profiles/test-stealth",
      headless: true,
      logger,
      screenshotsOnError: false,
      artifactsDir: "playwright-artifacts/test-stealth",
      stealth: {
        enabled: true,
        locale: "en-US",
        languages: ["en-US", "en"],
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

    const fingerprint = await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      userAgent: navigator.userAgent,
      languages: navigator.languages,
      hasChromeRuntime: Boolean((window as Window & { chrome?: { runtime?: unknown } }).chrome?.runtime),
    }));

    expect(fingerprint.webdriver).toBeUndefined();
    expect(fingerprint.userAgent).not.toContain("HeadlessChrome");
    expect(fingerprint.languages).toEqual(["en-US", "en"]);
    expect(fingerprint.hasChromeRuntime).toBeTruthy();
  } finally {
    await session.close();
  }
});
