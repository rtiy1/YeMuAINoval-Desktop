import type { AgentSessionConfig, McpServerConfig } from "./agent-sdk-types.js";

const YEMU_MCP_SERVER_NAME = "yemu";
// COMPAT(mcpServerName): legacy "paseo" internal MCP server stripped as well, remove after 2026-11-30.
const LEGACY_YEMU_MCP_SERVER_NAME = "paseo";
const YEMU_MCP_PATHNAME = "/mcp/agents";

export function stripInternalPaseoMcpServer(config: AgentSessionConfig): AgentSessionConfig {
  const mcpServers = config.mcpServers;
  if (!mcpServers) {
    return config;
  }

  const internalServer =
    mcpServers[YEMU_MCP_SERVER_NAME] ?? mcpServers[LEGACY_YEMU_MCP_SERVER_NAME];
  if (!internalServer || !isInternalPaseoMcpServer(internalServer)) {
    return config;
  }

  const nextMcpServers = { ...mcpServers };
  delete nextMcpServers[YEMU_MCP_SERVER_NAME];
  delete nextMcpServers[LEGACY_YEMU_MCP_SERVER_NAME];

  const next = { ...config };
  if (Object.keys(nextMcpServers).length > 0) {
    next.mcpServers = nextMcpServers;
  } else {
    delete next.mcpServers;
  }
  return next;
}

export function withRuntimePaseoMcpServer(params: {
  config: AgentSessionConfig;
  agentId: string;
  mcpBaseUrl: string | null;
  /**
   * Capability token authenticating the injected connection to the daemon's
   * Agent MCP endpoint. The daemon password is gated off this route, so without
   * this header the agent's MCP requests are rejected when a password is set.
   */
  mcpAuthToken: string | null;
}): AgentSessionConfig {
  const storedConfig = stripInternalPaseoMcpServer(params.config);
  if (!params.mcpBaseUrl || storedConfig.mcpServers?.[YEMU_MCP_SERVER_NAME]) {
    return storedConfig;
  }

  return {
    ...storedConfig,
    mcpServers: {
      [YEMU_MCP_SERVER_NAME]: {
        type: "http",
        url: `${params.mcpBaseUrl}?callerAgentId=${params.agentId}`,
        ...(params.mcpAuthToken
          ? { headers: { Authorization: `Bearer ${params.mcpAuthToken}` } }
          : {}),
      },
      ...storedConfig.mcpServers,
    },
  };
}

function isInternalPaseoMcpServer(config: McpServerConfig): boolean {
  if (config.type !== "http" && config.type !== "sse") {
    return false;
  }

  try {
    return new URL(config.url).pathname === YEMU_MCP_PATHNAME;
  } catch {
    return false;
  }
}
