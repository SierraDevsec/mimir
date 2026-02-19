import { useEffect, useRef, useState, useCallback } from "react";

export interface WsEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export function useWebSocket() {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const token = new URLSearchParams(location.search).get("mimir_token");
    const wsPath = token ? `/ws?token=${encodeURIComponent(token)}` : "/ws";
    const ws = new WebSocket(`${protocol}//${location.host}${wsPath}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnectCount((c) => c + 1);
    };
    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 3000);
    };
    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as WsEvent;
        setEvents((prev) => [parsed, ...prev].slice(0, 200));
      } catch (_) { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, connected, reconnectCount, clearEvents };
}
