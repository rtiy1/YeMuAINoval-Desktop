import { pino } from "pino";

import { createBridgeServer } from "./index.js";

const logger = pino({
  level: process.env.YEMU_BRIDGE_LOG_LEVEL ?? "info",
  name: "yemu-bridge",
});

async function main(): Promise<void> {
  const port = Number(process.env.YEMU_BRIDGE_PORT ?? "5001");
  const host = process.env.YEMU_BRIDGE_HOST ?? "127.0.0.1";
  const workspaceRoot = process.env.YEMU_WORKSPACE_ROOT;

  const bridge = createBridgeServer({
    logger,
    port,
    host,
    ...(workspaceRoot ? { workspaceRoot } : {}),
  });

  await bridge.start();
  logger.info({ port }, "YeMu bridge ready on http://127.0.0.1:" + port);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down bridge");
    await bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
