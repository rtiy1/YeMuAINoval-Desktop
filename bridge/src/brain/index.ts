import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Logger } from "pino";

import { ProjectManager } from "./project-manager.js";
import { handleApiV1 } from "./api-v1.js";
import { handleBrainRequest } from "./routes-brain.js";

export interface BridgeServerOptions {
  logger: Logger;
  port?: number;
  host?: string;
  workspaceRoot?: string;
}

export interface BridgeServer {
  server: Server;
  start(): Promise<void>;
  stop(): Promise<void>;
  getPort(): number;
}

export function createBridgeServer(options: BridgeServerOptions): BridgeServer {
  const logger = options.logger;
  const projects = new ProjectManager(
    { logger },
    options.workspaceRoot ?? join(homedir(), "eigent", "workspace"),
  );

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const pathname = url.pathname;

      if (pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (pathname.startsWith("/api/v1/")) {
        await handleApiV1(req, res, pathname, url);
        return;
      }

      await handleBrainRequest(req, res, pathname, url, projects);
    } catch (error) {
      logger.error({ error }, "Unhandled bridge request error");
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 1, text: "Internal bridge error" }));
      } else {
        res.end();
      }
    }
  });

  server.on("error", (error) => {
    logger.error({ error }, "Bridge HTTP server error");
  });

  return {
    server,
    async start() {
      const port = options.port ?? 5001;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, options.host ?? "127.0.0.1", () => {
          server.removeListener("error", reject);
          logger.info({ port }, "Bridge server listening");
          resolve();
        });
      });
    },
    async stop() {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
    getPort() {
      const address = server.address();
      return typeof address === "object" && address ? address.port : options.port ?? 5001;
    },
  };
}
