export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

export interface AppLogger {
  child(bindings: LogContext): AppLogger;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class ConsoleLogger implements AppLogger {
  constructor(
    private readonly minimumLevel: LogLevel = "info",
    private readonly bindings: LogContext = {},
  ) {}

  child(bindings: LogContext): AppLogger {
    return new ConsoleLogger(this.minimumLevel, {
      ...this.bindings,
      ...bindings,
    });
  }

  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write("error", message, context);
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (levelOrder[level] < levelOrder[this.minimumLevel]) {
      return;
    }

    const payload = {
      time: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...(context ?? {}),
    };
    const serialized = JSON.stringify(payload);

    if (level === "warn" || level === "error") {
      console.error(serialized);
      return;
    }

    console.log(serialized);
  }
}
