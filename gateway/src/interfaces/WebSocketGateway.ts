import { WebSocketServer, type WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import type { Logger } from "../domain/contracts.js";
import type {
  ClientMessage,
  NormalizedObservation,
  SubscriptionFilter,
  ThingState,
} from "../domain/models.js";
import { parseJsonLike } from "../shared/json.js";

interface OutboundMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * API WebSocket genérica: entrega snapshot + `thing.updated` (estado por Thing)
 * y ademas `observation` (evento crudo). Filtro opcional por tipo de Thing o
 * por ids, sin ninguna logica de dominio.
 */
export class WebSocketGateway {
  private readonly server: WebSocketServer;
  /** Filtro por cliente. `null` = todos los Things. */
  private readonly clients = new Map<WebSocket, SubscriptionFilter | null>();

  public constructor(
    fastify: FastifyInstance,
    path: string,
    private readonly store: { getAll(): ThingState[] },
    private readonly logger: Logger,
  ) {
    this.server = new WebSocketServer({ server: fastify.server, path });
  }

  public start(): void {
    this.server.on("connection", (socket) => {
      // Sin filtro por defecto: snapshot + live de todos al conectar.
      this.clients.set(socket, null);
      this.send(socket, { type: "welcome" });
      this.sendSnapshot(socket, null);

      socket.on("message", (value) => {
        this.handleMessage(socket, value.toString("utf8"));
      });

      socket.on("close", () => {
        this.clients.delete(socket);
      });
    });
  }

  /** Difunde el estado actualizado de un Thing a los clientes que lo filtran. */
  public broadcastThingUpdated(thing: ThingState): void {
    for (const [socket, filter] of this.clients) {
      if (this.matches(filter, thing.type, thing.thingId)) {
        this.send(socket, { type: "thing.updated", thing });
      }
    }
  }

  /** Difunde una observacion cruda a los clientes que la filtran. */
  public broadcastObservation(observation: NormalizedObservation): void {
    for (const [socket, filter] of this.clients) {
      if (this.matches(filter, observation.type, observation.thingId)) {
        this.send(socket, { type: "observation", data: observation });
      }
    }
  }

  private handleMessage(socket: WebSocket, rawText: string): void {
    const parsed = parseJsonLike(rawText);

    if (!parsed || typeof parsed !== "object") {
      this.send(socket, { type: "error", message: "Payload JSON invalido" });
      return;
    }

    const message = parsed as ClientMessage;

    if (message.action === "ping") {
      this.send(socket, { type: "pong" });
      return;
    }

    if (message.action === "subscribe") {
      const filter = this.normalizeFilter(message.filter);
      this.clients.set(socket, filter);
      this.sendSnapshot(socket, filter);
      return;
    }

    this.send(socket, { type: "error", message: "Accion no reconocida" });
  }

  private normalizeFilter(filter?: SubscriptionFilter): SubscriptionFilter | null {
    if (!filter) {
      return null;
    }

    const thingTypes = filter.thingTypes?.length ? filter.thingTypes : undefined;
    const thingIds = filter.thingIds?.length ? filter.thingIds : undefined;

    return thingTypes || thingIds ? { thingTypes, thingIds } : null;
  }

  private sendSnapshot(socket: WebSocket, filter: SubscriptionFilter | null): void {
    const things = this.store
      .getAll()
      .filter((thing) => this.matches(filter, thing.type, thing.thingId));

    this.send(socket, { type: "snapshot", things });
  }

  private matches(
    filter: SubscriptionFilter | null,
    type: string,
    thingId: number,
  ): boolean {
    if (!filter) {
      return true;
    }

    if (filter.thingTypes && !filter.thingTypes.includes(type)) {
      return false;
    }

    if (filter.thingIds && !filter.thingIds.includes(thingId)) {
      return false;
    }

    return true;
  }

  private send(socket: WebSocket, payload: OutboundMessage): void {
    if (socket.readyState !== socket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(payload));
  }
}
