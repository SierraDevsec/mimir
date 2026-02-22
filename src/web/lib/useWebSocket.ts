// Re-exports WsEvent type and delegates to the shared WebSocket context.
// Components that previously imported useWebSocket() directly continue to work.
export type { WsEvent } from "./WebSocketContext";
export { useSharedWebSocket as useWebSocket } from "./WebSocketContext";
