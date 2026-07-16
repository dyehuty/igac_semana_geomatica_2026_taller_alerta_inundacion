import mqtt, { type MqttClient } from "mqtt";
import type { Logger, RealtimeSource } from "../domain/contracts.js";
import { parseJsonLike } from "../shared/json.js";

type ObservationHandler = (
  datastreamId: number,
  result: unknown,
  phenomenonTime: string,
) => void;

/** Extrae el id del datastream desde el topic `v1.1/Datastreams(45)/Observations`. */
const DATASTREAM_TOPIC = /Datastreams\((\d+)\)\/Observations$/;

export function datastreamIdFromTopic(topic: string): number | null {
  const match = DATASTREAM_TOPIC.exec(topic);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function topicFor(datastreamId: number): string {
  return `v1.1/Datastreams(${datastreamId})/Observations`;
}

/**
 * Adaptador MQTT de FROST. Se suscribe a los topics CONCRETOS de cada
 * Datastream (FROST no publica en comodines profundos) y entrega el `result`
 * de cada observacion junto al id de datastream tomado del topic.
 */
export class MqttRealtimeSource implements RealtimeSource {
  private client: MqttClient | null = null;
  private connected = false;
  private readonly subscribed = new Set<number>();
  private onObservation: ObservationHandler = () => {};

  public constructor(
    private readonly url: string,
    private readonly clientId: string,
    private readonly logger: Logger,
  ) {}

  public async start(datastreamIds: number[], onObservation: ObservationHandler): Promise<void> {
    this.onObservation = onObservation;
    this.client = mqtt.connect(this.url, {
      clientId: this.clientId,
      reconnectPeriod: 2_000,
    });

    this.client.on("connect", () => {
      this.connected = true;
      this.logger.info("Conectado al broker MQTT", { url: this.url });
      // Re-suscribe todo lo conocido (arranque y reconexiones).
      const ids = [...this.subscribed, ...datastreamIds];
      this.subscribed.clear();
      this.subscribeMore(ids);
    });

    this.client.on("reconnect", () => {
      this.logger.warn("Reconectando al broker MQTT", { url: this.url });
    });

    this.client.on("close", () => {
      this.connected = false;
      this.logger.warn("Conexion MQTT cerrada", { url: this.url });
    });

    this.client.on("error", (error) => {
      this.logger.error("Error MQTT", { error: error.message });
    });

    this.client.on("message", (topic, payload) => {
      this.handleMessage(topic, payload);
    });
  }

  /** Suscribe a datastreams nuevos (idempotente). */
  public subscribeMore(datastreamIds: number[]): void {
    if (!this.client) {
      return;
    }

    const pending = datastreamIds.filter((id) => !this.subscribed.has(id));

    if (pending.length === 0) {
      return;
    }

    const topics = pending.map(topicFor);
    this.client.subscribe(topics, (error) => {
      if (error) {
        this.logger.error("No fue posible suscribirse a topics MQTT", {
          count: topics.length,
          error: error.message,
        });
        return;
      }

      for (const id of pending) {
        this.subscribed.add(id);
      }

      this.logger.info("Suscrito a topics de Datastream", { added: pending.length });
    });
  }

  public isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(topic: string, payload: Buffer): void {
    const datastreamId = datastreamIdFromTopic(topic);

    if (datastreamId === null) {
      return;
    }

    const parsed = parseJsonLike(payload.toString("utf8"));

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    const record = parsed as Record<string, unknown>;
    const phenomenonTime =
      typeof record.phenomenonTime === "string"
        ? record.phenomenonTime
        : new Date().toISOString();

    this.onObservation(datastreamId, record.result, phenomenonTime);
  }
}
