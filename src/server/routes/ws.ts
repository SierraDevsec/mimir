import type { WSContext } from "hono/ws";

const clients = new Set<WSContext>();

export function addClient(ws: WSContext): void {
  clients.add(ws);
}

export function removeClient(ws: WSContext): void {
  clients.delete(ws);
}

export function broadcast(event: string, data: unknown): void {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const client of clients) {
    try {
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }
}
