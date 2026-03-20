import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "playwright";

import { defaultSelectors } from "../src/selectors/selectors";
import { readBooleanEnv, resolveUserDataDir } from "./helpers";

async function main(): Promise<void> {
  const userDataDir = resolveUserDataDir(".profiles/guest");
  const headless = readBooleanEnv("GEMINI_HEADLESS", true);
  const probePrompt =
    process.env.GEMINI_PROBE_PROMPT ??
    "Reply with exactly the word PONG";
  const outputDir = path.resolve("playwright-artifacts", "dom-inspect");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  await mkdir(outputDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://gemini.google.com/app", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(5_000);

    const composer = page
      .locator('[aria-label="Enter a prompt for Gemini"][contenteditable="true"]')
      .first();
    await composer.click();
    await page.keyboard.insertText(probePrompt);
    await page.locator('button[aria-label="Send message"]').click();
    await page.waitForTimeout(10_000);

    const selectorCounts = await collectSelectorCounts(page);
    const report = {
      timestamp,
      url: page.url(),
      title: await page.title(),
      probePrompt,
      selectorCounts,
      mainText: (await page.locator("main").innerText().catch(() => "")).slice(
        0,
        6_000,
      ),
      modelResponseHtml: await page
        .locator("model-response")
        .last()
        .evaluate((element) => element.outerHTML)
        .catch(() => ""),
    };

    const reportPath = path.join(outputDir, `${timestamp}.json`);
    const htmlPath = path.join(outputDir, `${timestamp}.html`);

    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    await writeFile(htmlPath, await page.content(), "utf8");

    console.log(`DOM report saved to ${reportPath}`);
    console.log(`HTML snapshot saved to ${htmlPath}`);
  } finally {
    await context.close();
  }
}

async function collectSelectorCounts(
  page: Page,
): Promise<Record<string, number>> {
  const groups = Object.entries(defaultSelectors) as Array<
    [keyof typeof defaultSelectors, string[]]
  >;
  const counts: Record<string, number> = {};

  for (const [groupName, selectors] of groups) {
    for (const selector of selectors) {
      counts[`${groupName}:${selector}`] = await page
        .locator(selector)
        .count()
        .catch(() => -1);
    }
  }

  return counts;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
