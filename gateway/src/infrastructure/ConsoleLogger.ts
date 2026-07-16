import type { Logger } from "../domain/contracts.js";

/**
 * Logger estructurado ligero sobre consola.
 */
export class ConsoleLogger implements Logger {
  public info(message: string, context?: Record<string, unknown>): void {
    this.log("INFO", message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log("WARN", message, context);
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.log("ERROR", message, context);
  }

  private log(level: string, message: string, context?: Record<string, unknown>): void {
    const suffix = context ? ` ${JSON.stringify(context)}` : "";
    console.log(`[${level}] ${message}${suffix}`);
  }
}
