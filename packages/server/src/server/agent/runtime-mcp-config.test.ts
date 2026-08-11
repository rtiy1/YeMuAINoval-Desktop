import { describe, expect, test } from "vitest";

import type { AgentSessionConfig } from "./agent-sdk-types.js";
import { stripInternalPaseoMcpServer, withRuntimePaseoMcpServer } from "./runtime-mcp-config.js";

const BASE_CONFIG: AgentSessionConfig = {
  provider: "claude",
  cwd: "/tmp/agent",
};

describe("withRuntimePaseoMcpServer", () => {
  test("injects the yemu MCP server with a bearer header when a token is provided", () => {
    const result = withRuntimePaseoMcpServer({
      config: BASE_CONFIG,
      agentId: "agent-1",
      mcpBaseUrl: "http://127.0.0.1:6767/mcp/agents",
      mcpAuthToken: "cap-token",
    });

    expect(result.mcpServers?.yemu).toEqual({
      type: "http",
      url: "http://127.0.0.1:6767/mcp/agents?callerAgentId=agent-1",
      headers: { Authorization: "Bearer cap-token" },
    });
  });

  test("omits the header when no token is available", () => {
    const result = withRuntimePaseoMcpServer({
      config: BASE_CONFIG,
      agentId: "agent-1",
      mcpBaseUrl: "http://127.0.0.1:6767/mcp/agents",
      mcpAuthToken: null,
    });

    expect(result.mcpServers?.yemu).toEqual({
      type: "http",
      url: "http://127.0.0.1:6767/mcp/agents?callerAgentId=agent-1",
    });
  });

  test("does not inject when no MCP base URL is configured", () => {
    const result = withRuntimePaseoMcpServer({
      config: BASE_CONFIG,
      agentId: "agent-1",
      mcpBaseUrl: null,
      mcpAuthToken: "cap-token",
    });

    expect(result.mcpServers).toBeUndefined();
  });

  test("strips the legacy paseo internal server before re-injecting", () => {
    // COMPAT(mcpServerName): legacy "paseo" internal MCP server stripped until 2026-11-30.
    const result = withRuntimePaseoMcpServer({
      config: {
        ...BASE_CONFIG,
        mcpServers: {
          paseo: { type: "http", url: "http://127.0.0.1:6767/mcp/agents?callerAgentId=old" },
        },
      },
      agentId: "agent-1",
      mcpBaseUrl: "http://127.0.0.1:6767/mcp/agents",
      mcpAuthToken: null,
    });

    expect(result.mcpServers?.paseo).toBeUndefined();
    expect(result.mcpServers?.yemu).toBeDefined();
  });

  test("keeps unrelated MCP servers untouched", () => {
    const result = stripInternalPaseoMcpServer({
      ...BASE_CONFIG,
      mcpServers: {
        custom: { type: "http", url: "http://localhost:9000/sse" },
      },
    });

    expect(result.mcpServers?.custom).toEqual({
      type: "http",
      url: "http://localhost:9000/sse",
    });
  });
});
