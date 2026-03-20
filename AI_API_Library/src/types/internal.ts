import type { Locator } from "playwright";
import type { AssistantContentSnapshot } from "../response/readLatestAssistantContent";

export interface RequestContext {
  requestId: string;
  startedAt: string;
  timeoutMs: number;
  newChat: boolean;
  model?: string;
}

export interface PromptSubmission {
  requestId: string;
  startedAt: string;
  assistantCountBefore: number;
  assistantSnapshotBefore: AssistantContentSnapshot;
  userCountBefore: number;
  promptLength: number;
}

export interface SelectorResolution {
  locator: Locator;
  selector: string;
}
