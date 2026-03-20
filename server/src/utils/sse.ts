import type { ServerResponse } from "node:http";

import { AppError } from "./AppError";

export class SseWriter {
  private opened = false;

  constructor(private readonly response: ServerResponse) {}

  get started(): boolean {
    return this.opened;
  }

  open(): void {
    if (this.opened) {
      return;
    }

    this.response.statusCode = this.response.statusCode || 200;
    this.response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    this.response.setHeader("Cache-Control", "no-cache, no-transform");
    this.response.setHeader("Connection", "keep-alive");
    this.response.setHeader("X-Accel-Buffering", "no");

    if (typeof this.response.flushHeaders === "function") {
      this.response.flushHeaders();
    }

    this.opened = true;
  }

  writeData(payload: unknown): void {
    this.ensureOpen();
    this.writeChunk(`data: ${JSON.stringify(payload)}\n\n`);
  }

  writeRawData(raw: string): void {
    this.ensureOpen();
    this.writeChunk(`data: ${raw}\n\n`);
  }

  writeComment(comment: string): void {
    this.ensureOpen();
    this.writeChunk(`: ${comment}\n\n`);
  }

  close(): void {
    if (this.response.writableEnded) {
      return;
    }

    this.response.end();
  }

  private ensureOpen(): void {
    if (!this.opened) {
      this.open();
    }
  }

  private writeChunk(chunk: string): void {
    if (this.response.destroyed || this.response.writableEnded) {
      throw new AppError("Client disconnected", {
        code: "CLIENT_DISCONNECTED",
        statusCode: 499,
        type: "api_error",
      });
    }

    this.response.write(chunk);
  }
}
