import type {
  BackendSendInput,
  BackendSendResult,
  BackendStreamInput,
  ChatBackendSessionAdapter,
  SessionInfoSnapshot,
} from "../types/internal";

export class StubSessionAdapter implements ChatBackendSessionAdapter {
  constructor(public readonly sessionId: string) {}

  async init(): Promise<void> {}

  async send(input: BackendSendInput): Promise<BackendSendResult> {
    const startedAt = new Date().toISOString();
    const text = this.buildStubText(input);

    return {
      text,
      kind: "text",
      media: [],
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  async sendStream(input: BackendStreamInput): Promise<BackendSendResult> {
    const startedAt = new Date().toISOString();
    const text = this.buildStubText(input);
    const chunks = chunkText(text, 24);
    let aggregate = "";

    for (let index = 0; index < chunks.length; index += 1) {
      const delta = chunks[index] ?? "";
      aggregate += delta;

      input.onChunk({
        text: aggregate,
        delta,
        done: index === chunks.length - 1,
        kind: "text",
        media: [],
      });
    }

    return {
      text,
      kind: "text",
      media: [],
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  async getSessionInfo(): Promise<SessionInfoSnapshot> {
    return {
      mode: "stub",
      headless: true,
      sessionId: this.sessionId,
    };
  }

  async close(): Promise<void> {}

  private buildStubText(input: BackendSendInput): string {
    const preview = input.prompt.slice(0, 320);

    return [
      `[stub:${this.sessionId}] Skeleton backend is active.`,
      `Requested backend model: ${input.backendModel}`,
      "",
      "Prompt preview:",
      preview,
    ].join("\n");
  }
}

function chunkText(value: string, size: number): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }

  return chunks.length > 0 ? chunks : [""];
}
