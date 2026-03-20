import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "../config/env";
import { GeminiSessionAdapter } from "../adapters/GeminiSessionAdapter";
import { StubSessionAdapter } from "../adapters/StubSessionAdapter";
import type { AppLogger } from "../telemetry/Logger";
import type { ChatBackendSessionAdapter } from "../types/internal";

export class SessionFactory {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {}

  async create(sessionId: string): Promise<ChatBackendSessionAdapter> {
    await mkdir(this.config.session.userDataDirRoot, { recursive: true });

    if (this.config.backend.mode === "stub") {
      const adapter = new StubSessionAdapter(sessionId);
      await adapter.init();
      return adapter;
    }

    const adapter = await GeminiSessionAdapter.create({
      sessionId,
      moduleEntryPath: this.config.backend.libraryEntryPath,
      clientOptions: this.buildGeminiClientOptions(sessionId),
      logger: this.logger.child({
        component: "gemini_session",
        sessionId,
      }),
    });

    await adapter.init();
    return adapter;
  }

  private buildGeminiClientOptions(sessionId: string): Record<string, unknown> {
    const userDataDir = path.join(this.config.session.userDataDirRoot, sessionId);

    return {
      userDataDir,
      headless: this.config.session.headless,
      defaultTimeoutMs: this.config.session.defaultTimeoutMs,
      stealth: {
        enabled: this.config.session.stealth,
      },
      ...(this.config.session.storageStatePath
        ? {
            authState: {
              storageStatePath: this.config.session.storageStatePath,
              indexedDB: true,
            },
          }
        : {}),
    };
  }
}
