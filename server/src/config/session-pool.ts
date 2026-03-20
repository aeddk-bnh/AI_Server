import type { AppConfig } from "./env";

export interface SessionPoolConfig {
  size: number;
  warmupSize: number;
  minReadySessions: number;
  acquireTimeoutMs: number;
}

export function buildSessionPoolConfig(config: AppConfig): SessionPoolConfig {
  return {
    size: config.session.poolSize,
    warmupSize: config.session.warmupSize,
    minReadySessions: config.session.minReadySessions,
    acquireTimeoutMs: config.session.acquireTimeoutMs,
  };
}
