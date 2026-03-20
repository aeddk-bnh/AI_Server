import type { Locator, Page } from "playwright";

import type { GeminiSelectorRegistry } from "../selectors/selectors";

import { getLastMatch } from "../selectors/selectors";

export async function readLatestAssistantText(
  page: Page,
  selectors: GeminiSelectorRegistry,
): Promise<string> {
  const latestAssistantMessage = await getLastMatch(
    page,
    selectors.assistantMessages,
  );

  if (!latestAssistantMessage) {
    return "";
  }

  const target =
    (await resolveNestedContent(
      latestAssistantMessage.locator,
      selectors.assistantMessageContents,
    )) ?? latestAssistantMessage.locator;
  const rawText = (await target
    .innerText()
    .catch(() => target.textContent())) ?? "";

  return normalizeResponseText(rawText);
}

export function normalizeResponseText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^Gemini said(?:\n+|$)/i, "")
    .replace(/^Gemini da noi(?:\n+|$)/i, "")
    .trim();
}

async function resolveNestedContent(
  container: Locator,
  selectors: string[],
): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = container.locator(selector).last();
    const count = await locator.count().catch(() => 0);

    if (count > 0) {
      return locator;
    }
  }

  return null;
}
