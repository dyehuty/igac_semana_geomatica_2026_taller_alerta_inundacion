import type { Logger } from "../domain/contracts.js";

/**
 * Logger estructurado ligero sobre consola.
 */
export class ConsoleLogger implements Logger {
  /** Escribe un mensaje de nivel informativo. */
  public info(message: string, context?: Record<string, unknown>): void {
    this.log("INFO", message, context);
  }

  /** Escribe una advertencia y conserva su contexto estructurado. */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.log("WARN", message, context);
  }

  /** Escribe un error y conserva su contexto estructurado. */
  public error(message: string, context?: Record<string, unknown>): void {
    this.log("ERROR", message, context);
  }

  /** Formatea el nivel, el mensaje y el contexto como una línea de consola. */
  private log(level: string, message: string, context?: Record<string, unknown>): void {
    const suffix = context ? ` ${JSON.stringify(context)}` : "";
    console.log(`[${level}] ${message}${suffix}`);
  }
}
