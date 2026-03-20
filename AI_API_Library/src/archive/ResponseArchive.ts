import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { APIResponse, Page } from "playwright";

import type { ResolvedGeminiWebClientOptions } from "../config/defaults";
import type { GeminiSelectorRegistry } from "../selectors/selectors";
import type {
  GeminiArchivedMediaFile,
  GeminiMediaArchiveRecord,
  LoggerLike,
  SendResult,
} from "../types/public";

import { getLastMatch } from "../selectors/selectors";
import { log } from "../telemetry/Logger";

export interface ArchiveMediaResponseInput {
  page: Page;
  prompt: string;
  result: SendResult;
}

interface MediaArchiveManifest {
  requestId: string;
  kind: SendResult["kind"];
  prompt: string;
  text: string;
  startedAt: string;
  completedAt: string;
  savedAt: string;
  pageUrl: string;
  responseHtmlPath: string | null;
  responseScreenshotPath: string | null;
  responseTextPath: string | null;
  promptPath: string;
  media: SendResult["media"];
  mediaFiles: GeminiArchivedMediaFile[];
}

export class ResponseArchive {
  constructor(
    private readonly selectors: GeminiSelectorRegistry,
    private readonly options: ResolvedGeminiWebClientOptions,
    private readonly logger: LoggerLike,
  ) {}

  async archiveMediaResponse(
    input: ArchiveMediaResponseInput,
  ): Promise<GeminiMediaArchiveRecord | undefined> {
    if (
      !this.options.mediaArchive.enabled ||
      input.result.media.length === 0
    ) {
      return undefined;
    }

    const archiveDirectory = await this.createArchiveDirectory(
      input.result.requestId,
    );
    const promptPath = path.join(archiveDirectory, "prompt.txt");
    const responseTextPath =
      input.result.text.trim().length > 0
        ? path.join(archiveDirectory, "response.txt")
        : null;

    await writeFile(promptPath, input.prompt, "utf8");

    if (responseTextPath) {
      await writeFile(responseTextPath, input.result.text, "utf8");
    }

    const responseHtmlPath = await this.saveLatestResponseHtml(
      input.page,
      archiveDirectory,
    );
    const responseScreenshotPath = await this.saveLatestResponseScreenshot(
      input.page,
      archiveDirectory,
    );
    const mediaFiles = this.options.mediaArchive.downloadMedia
      ? await this.downloadMediaFiles(
          input.page,
          archiveDirectory,
          input.result,
        )
      : input.result.media.map((media, index) => ({
          mediaIndex: index + 1,
          kind: media.kind,
          sourceUrl: media.url,
          savedPath: null,
          contentType: null,
          error: "Media download is disabled",
        }));

    const manifestPath = path.join(archiveDirectory, "manifest.json");
    const manifest: MediaArchiveManifest = {
      requestId: input.result.requestId,
      kind: input.result.kind,
      prompt: input.prompt,
      text: input.result.text,
      startedAt: input.result.startedAt,
      completedAt: input.result.completedAt,
      savedAt: new Date().toISOString(),
      pageUrl: input.page.url(),
      responseHtmlPath,
      responseScreenshotPath,
      responseTextPath,
      promptPath,
      media: input.result.media,
      mediaFiles,
    };

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const record: GeminiMediaArchiveRecord = {
      directory: archiveDirectory,
      manifestPath,
      promptPath,
      responseTextPath,
      responseHtmlPath,
      responseScreenshotPath,
      mediaFiles,
    };

    log(this.logger, "info", "media_response_archived", {
      requestId: input.result.requestId,
      archiveDirectory: record.directory,
      manifestPath: record.manifestPath,
      mediaCount: input.result.media.length,
      downloadedCount: record.mediaFiles.filter((item) => item.savedPath).length,
    });

    return record;
  }

  private async createArchiveDirectory(requestId: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveDirectory = path.join(
      this.options.mediaArchive.directory,
      `${timestamp}-${requestId}`,
    );

    await mkdir(archiveDirectory, { recursive: true });

    return archiveDirectory;
  }

  private async saveLatestResponseHtml(
    page: Page,
    archiveDirectory: string,
  ): Promise<string | null> {
    const latestAssistant = await getLastMatch(
      page,
      this.selectors.assistantMessages,
    );

    if (!latestAssistant) {
      return null;
    }

    const htmlPath = path.join(archiveDirectory, "response.html");
    const outerHtml = await latestAssistant.locator
      .evaluate((node) => node.outerHTML)
      .catch(() => "");

    if (!outerHtml) {
      return null;
    }

    await writeFile(htmlPath, outerHtml, "utf8");
    return htmlPath;
  }

  private async saveLatestResponseScreenshot(
    page: Page,
    archiveDirectory: string,
  ): Promise<string | null> {
    const latestAssistant = await getLastMatch(
      page,
      this.selectors.assistantMessages,
    );

    if (!latestAssistant) {
      return null;
    }

    const screenshotPath = path.join(archiveDirectory, "response.png");
    const saved = await latestAssistant.locator
      .screenshot({ path: screenshotPath })
      .then(() => true)
      .catch(() => false);

    return saved ? screenshotPath : null;
  }

  private async downloadMediaFiles(
    page: Page,
    archiveDirectory: string,
    result: SendResult,
  ): Promise<GeminiArchivedMediaFile[]> {
    const files: GeminiArchivedMediaFile[] = [];

    for (const [index, media] of result.media.entries()) {
      files.push(
        await this.downloadSingleMediaFile(
          page,
          archiveDirectory,
          media.kind,
          media.url,
          index,
        ),
      );
    }

    return files;
  }

  private async downloadSingleMediaFile(
    page: Page,
    archiveDirectory: string,
    kind: GeminiArchivedMediaFile["kind"],
    sourceUrl: string | null,
    index: number,
  ): Promise<GeminiArchivedMediaFile> {
    const mediaIndex = index + 1;

    if (!sourceUrl) {
      return {
        mediaIndex,
        kind,
        sourceUrl,
        savedPath: null,
        contentType: null,
        error: "Media URL is not available",
      };
    }

    let response: APIResponse | null = null;

    try {
      response = await page.request.get(sourceUrl, {
        timeout: this.options.defaultTimeoutMs,
      });

      if (!response.ok()) {
        return {
          mediaIndex,
          kind,
          sourceUrl,
          savedPath: null,
          contentType: response.headers()["content-type"] ?? null,
          error: `Download failed with status ${response.status()}`,
        };
      }

      const contentType = response.headers()["content-type"] ?? null;
      const extension = inferFileExtension(sourceUrl, contentType, kind);
      const filePath = path.join(
        archiveDirectory,
        `media-${String(mediaIndex).padStart(2, "0")}-${kind}${extension}`,
      );

      await writeFile(filePath, await response.body());

      return {
        mediaIndex,
        kind,
        sourceUrl,
        savedPath: filePath,
        contentType,
      };
    } catch (error) {
      return {
        mediaIndex,
        kind,
        sourceUrl,
        savedPath: null,
        contentType: null,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await response?.dispose().catch(() => undefined);
    }
  }
}

function inferFileExtension(
  sourceUrl: string,
  contentType: string | null,
  kind: GeminiArchivedMediaFile["kind"],
): string {
  const fromContentType = getExtensionFromContentType(contentType);
  if (fromContentType) {
    return fromContentType;
  }

  const fromUrl = getExtensionFromUrl(sourceUrl);
  if (fromUrl) {
    return fromUrl;
  }

  return kind === "video" ? ".mp4" : ".png";
}

function getExtensionFromContentType(contentType: string | null): string | null {
  if (!contentType) {
    return null;
  }

  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  switch (normalized) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    default:
      return null;
  }
}

function getExtensionFromUrl(sourceUrl: string): string | null {
  try {
    const parsed = new URL(sourceUrl);
    const extension = path.extname(parsed.pathname).toLowerCase();

    if (!extension || extension.length > 8) {
      return null;
    }

    return extension;
  } catch {
    return null;
  }
}
