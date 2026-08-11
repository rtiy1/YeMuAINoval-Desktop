import { defaultWebSocketFactory } from "@yemu/client/internal/daemon-client-websocket-transport";
import type { WebSocketFactory } from "@yemu/client/internal/daemon-client-transport-types";

export function createAppWebSocketFactory(): WebSocketFactory {
  return defaultWebSocketFactory;
}
