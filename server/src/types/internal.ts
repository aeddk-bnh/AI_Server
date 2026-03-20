export type BackendMode = "stub" | "gemini-web";
export type BackendProvider = "stub" | "gemini-web";
export type BackendResponseKind = "text" | "image" | "video" | "mixed";
export type BackendMediaKind = "image" | "video";
export type BackendMediaRenderer = "element" | "canvas";

export interface BackendMediaItem {
  kind: BackendMediaKind;
  url: string | null;
  alt: string | null;
  posterUrl: string | null;
  renderer: BackendMediaRenderer;
  width: number | null;
  height: number | null;
}

export interface BackendStreamChunk {
  text: string;
  delta: string;
  done: boolean;
  kind: BackendResponseKind;
  media: BackendMediaItem[];
}

export interface BackendSendInput {
  requestId: string;
  backendModel: string;
  prompt: string;
  timeoutMs: number;
}

export interface BackendStreamInput extends BackendSendInput {
  onChunk(chunk: BackendStreamChunk): void;
}

export interface BackendSendResult {
  text: string;
  kind: BackendResponseKind;
  media: BackendMediaItem[];
  startedAt: string;
  completedAt: string;
}

export interface SessionInfoSnapshot {
  [key: string]: unknown;
}

export interface ChatBackendSessionAdapter {
  sessionId: string;
  init(): Promise<void>;
  send(input: BackendSendInput): Promise<BackendSendResult>;
  sendStream(input: BackendStreamInput): Promise<BackendSendResult>;
  getSessionInfo(): Promise<SessionInfoSnapshot | null>;
  close(): Promise<void>;
}

export interface PublicModelDefinition {
  id: string;
  label: string;
  description?: string;
  ownedBy: string;
  backendProvider: BackendProvider;
  backendModel: string;
  supportsStream: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  enabled: boolean;
}

export interface ModelAliasConfig {
  defaultModel: string;
  models: PublicModelDefinition[];
}

export interface SessionPoolStats {
  size: number;
  idle: number;
  busy: number;
  starting: number;
  broken: number;
  recycling: number;
  queued: number;
}
