import path from "node:path";

export function resolveUserDataDir(
  fallbackRelativePath: string,
  explicitPath = process.env.GEMINI_USER_DATA_DIR,
): string {
  return path.resolve(explicitPath ?? fallbackRelativePath);
}

export function readBooleanEnv(
  key: string,
  fallback: boolean,
): boolean {
  const rawValue = process.env[key];

  if (!rawValue) {
    return fallback;
  }

  return /^(1|true|yes)$/i.test(rawValue);
}

export function readNumberEnv(
  key: string,
  fallback: number,
): number {
  const rawValue = process.env[key];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readStringEnv(
  key: string,
  fallback: string,
): string {
  const rawValue = process.env[key];
  return rawValue && rawValue.trim().length > 0 ? rawValue.trim() : fallback;
}
