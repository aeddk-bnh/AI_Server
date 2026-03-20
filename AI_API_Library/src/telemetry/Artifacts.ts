import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Page } from "playwright";

import type { ResolvedGeminiWebClientOptions } from "../config/defaults";
import type { GeminiWebPhase, ArtifactSummary } from "../errors/GeminiWebError";
import type { LoggerLike } from "../types/public";

import { log } from "./Logger";

export interface ArtifactCaptureInput {
  page: Page;
  requestId: string;
  phase: GeminiWebPhase;
}

export class Artifacts {
  constructor(
    private readonly options: ResolvedGeminiWebClientOptions,
    private readonly logger: LoggerLike,
  ) {}

  async capture(input: ArtifactCaptureInput): Promise<ArtifactSummary> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `${timestamp}-${input.requestId}-${input.phase}`;

    await mkdir(this.options.artifactsDir, { recursive: true });

    const summary: ArtifactSummary = {
      url: input.page.url(),
    };

    if (this.options.screenshotsOnError) {
      const screenshotPath = path.join(
        this.options.artifactsDir,
        `${baseName}.png`,
      );

      await input.page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });

      summary.screenshotPath = screenshotPath;
    }

    const htmlPath = path.join(this.options.artifactsDir, `${baseName}.html`);
    await writeFile(htmlPath, await input.page.content(), "utf8");
    summary.htmlPath = htmlPath;

    log(this.logger, "debug", "artifact_saved", {
      requestId: input.requestId,
      phase: input.phase,
      screenshotPath: summary.screenshotPath,
      htmlPath: summary.htmlPath,
    });

    return summary;
  }
}

