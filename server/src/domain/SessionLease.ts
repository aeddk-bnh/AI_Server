import type { ChatBackendSessionAdapter } from "../types/internal";

export interface SessionLease {
  sessionId: string;
  adapter: ChatBackendSessionAdapter;
  release(): Promise<void>;
  markBroken(reason: string): Promise<void>;
}
