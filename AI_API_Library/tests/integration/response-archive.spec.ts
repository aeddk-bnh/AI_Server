import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { ResponseArchive } from "../../src/archive/ResponseArchive";
import { resolveClientOptions } from "../../src/config/defaults";
import { defaultSelectors } from "../../src/selectors/selectors";
import { NoopLogger } from "../../src/telemetry/Logger";
import type { SendResult } from "../../src/types/public";

const logger = new NoopLogger();
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+b7n8AAAAASUVORK5CYII=",
  "base64",
);
const fakeMp4 = Buffer.from("000000206674797069736F6D0000020069736F6D69736F32", "hex");

test("archives media responses with prompt and downloaded files", async ({
  page,
}) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gemini-archive-"));
  const server = createServer((request, response) => {
    if (request.url === "/image.png") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(tinyPng);
      return;
    }

    if (request.url === "/video.mp4") {
      response.writeHead(200, { "Content-Type": "video/mp4" });
      response.end(fakeMp4);
      return;
    }

    response.writeHead(404);
    response.end("not found");
  });

  try {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not resolve archive test server address");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    await page.setContent(`
      <model-response>
        <message-content>
          <div aria-live="polite" aria-busy="false">
            <p>Here are your generated assets.</p>
            <div class="attachment-container generated-images">
              <img src="${baseUrl}/image.png" alt="Generated image">
            </div>
            <video src="${baseUrl}/video.mp4"></video>
          </div>
        </message-content>
      </model-response>
    `);

    const archive = new ResponseArchive(
      defaultSelectors,
      resolveClientOptions({
        userDataDir: ".profiles/test-archive",
        headless: true,
        mediaArchive: {
          enabled: true,
          directory: tempDir,
          downloadMedia: true,
        },
        logger,
      }),
      logger,
    );
    const result: SendResult = {
      requestId: "req_archive_test",
      text: "Here are your generated assets.",
      kind: "mixed",
      media: [
        {
          kind: "image",
          url: `${baseUrl}/image.png`,
          alt: "Generated image",
          posterUrl: null,
          renderer: "element",
          width: 1,
          height: 1,
        },
        {
          kind: "video",
          url: `${baseUrl}/video.mp4`,
          alt: null,
          posterUrl: null,
          renderer: "element",
          width: 640,
          height: 360,
        },
      ],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    const record = await archive.archiveMediaResponse({
      page,
      prompt: "Create an image and a video of a sunrise over Ha Long Bay.",
      result,
    });

    expect(record).toBeDefined();
    expect(record?.mediaFiles).toHaveLength(2);
    expect(record?.responseHtmlPath).not.toBeNull();
    expect(record?.responseScreenshotPath).not.toBeNull();

    const promptText = await readFile(record!.promptPath, "utf8");
    expect(promptText).toContain("Create an image and a video");

    const manifest = JSON.parse(
      await readFile(record!.manifestPath, "utf8"),
    ) as {
      prompt: string;
      mediaFiles: Array<{ savedPath: string | null }>;
    };
    expect(manifest.prompt).toContain("sunrise over Ha Long Bay");
    expect(manifest.mediaFiles).toHaveLength(2);

    for (const mediaFile of record!.mediaFiles) {
      expect(mediaFile.savedPath).not.toBeNull();
      const savedStat = await stat(mediaFile.savedPath!);
      expect(savedStat.size).toBeGreaterThan(0);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await rm(tempDir, { recursive: true, force: true });
  }
});
