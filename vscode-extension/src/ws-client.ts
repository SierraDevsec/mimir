import WebSocket from "ws";
import type { WsMessage } from "./types";

type Listener = (msg: WsMessage) => void;

const REFRESH_EVENTS = new Set([
  "task_created",
  "task_updated",
  "task_deleted",
  "SubagentStart",
  "SubagentStop",
  "SessionStart",
  "SessionStop",
]);

export class WsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private listeners: Listener[] = [];
  private disposed = false;

  constructor(private url: string) {}

  connect(): void {
    if (this.disposed) return;
    try {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        // connected
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as WsMessage;
          if (REFRESH_EVENTS.has(msg.event)) {
            for (const fn of this.listeners) fn(msg);
          }
        } catch {
          // ignore parse errors
        }
      });

      this.ws.on("close", () => {
        this.scheduleReconnect();
      });

      this.ws.on("error", () => {
        this.ws?.close();
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }

  onRefresh(fn: Listener): void {
    this.listeners.push(fn);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.listeners = [];
  }
}
