import type { AppConfig } from "../config/env";
import type { SessionPoolStats } from "../types/internal";
import { SessionPoolService } from "./SessionPoolService";

export interface ReadinessResult {
  ok: boolean;
  pool: SessionPoolStats;
}

export class SessionHealthService {
  constructor(
    private readonly config: AppConfig,
    private readonly sessionPool: SessionPoolService,
  ) {}

  async getReadiness(): Promise<ReadinessResult> {
    const pool = this.sessionPool.getStats();
    const available = pool.idle + pool.busy;

    return {
      ok: available >= this.config.session.minReadySessions,
      pool,
    };
  }
}
