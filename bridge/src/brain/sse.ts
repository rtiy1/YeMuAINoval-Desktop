import type { ServerResponse } from "node:http";

/**
 * Eigent SSE framing: every message is `data: {"step": ..., "data": ...}\n\n`
 */
export function sseJson(step: string, data: unknown): string {
  return `data: ${JSON.stringify({ step, data })}\n\n`;
}

export interface SSEClient {
  res: ServerResponse;
  closed: boolean;
}

export function sendSse(client: SSEClient, step: string, data: unknown): void {
  if (client.closed) {
    return;
  }
  client.res.write(sseJson(step, data));
}

export function openSse(res: ServerResponse): SSEClient {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");
  const client: SSEClient = { res, closed: false };
  res.on("close", () => {
    client.closed = true;
  });
  return client;
}
