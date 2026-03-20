import { test, expect } from "@playwright/test";
import path from "node:path";

import { createGeminiWebClient } from "../../src";

test.describe("Gemini web client", () => {
  test.skip(
    !process.env.RUN_GEMINI_WEB_TESTS,
    "Set RUN_GEMINI_WEB_TESTS=1 to run real Gemini web tests.",
  );

  test("sends a prompt and receives a response", async () => {
    const userDataDir = path.resolve(
      process.env.GEMINI_USER_DATA_DIR ?? ".profiles/test-guest",
    );

    const client = await createGeminiWebClient({
      userDataDir,
      headless: true,
    });

    try {
      const result = await client.send("Reply with only the word PONG.", {
        newChat: true,
        timeoutMs: 90_000,
      });

      expect(result.text.trim().length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });
});
