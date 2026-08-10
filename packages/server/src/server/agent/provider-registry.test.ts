import { beforeEach, expect, test, vi } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import type {
  AgentModelDefinition,
  AgentSessionConfig,
  ProviderCatalog,
} from "./agent-sdk-types.js";

const mockState = vi.hoisted(() => ({
  constructorSettings: [] as unknown[],
  catalog: {
    models: [
      {
        provider: "mcode",
        id: "sonnet",
        label: "Sonnet",
        isDefault: true,
      },
    ] as AgentModelDefinition[],
    modes: [{ id: "default", label: "Always Ask" }],
    defaultModeId: "default",
  } satisfies ProviderCatalog,
}));

vi.mock("./providers/mcode/agent.js", () => ({
  MCodeAgentClient: class MCodeAgentClient {
    readonly provider = "mcode";
    readonly capabilities = {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    };

    constructor(options: { runtimeSettings?: unknown }) {
      mockState.constructorSettings.push(options.runtimeSettings);
    }

    async createSession(): Promise<never> {
      throw new Error("not implemented");
    }

    async resumeSession(): Promise<never> {
      throw new Error("not implemented");
    }

    async fetchCatalog(): Promise<ProviderCatalog> {
      return mockState.catalog;
    }

    async isAvailable(): Promise<boolean> {
      return true;
    }
  },
}));

import { buildProviderRegistry, createAllClients } from "./provider-registry.js";

const logger = createTestLogger();

beforeEach(() => {
  mockState.constructorSettings = [];
});

test("registers MCode as the only production provider", () => {
  const registry = buildProviderRegistry(logger);

  expect(Object.keys(registry)).toEqual(["mcode"]);
  expect(registry.mcode).toMatchObject({
    id: "mcode",
    label: "MCode",
    enabled: true,
    defaultModeId: "default",
  });
});

test("keeps mock providers isolated to development builds", () => {
  expect(Object.keys(buildProviderRegistry(logger, { isDev: false }))).toEqual(["mcode"]);
  expect(Object.keys(buildProviderRegistry(logger, { isDev: true }))).toEqual([
    "mcode",
    "mock",
    "mock-slow",
  ]);
});

test("passes MCode command and environment overrides to its client", () => {
  const clients = createAllClients(logger, {
    providerOverrides: {
      mcode: {
        command: ["custom-mcode", "--verbose"],
        env: { MCODE_CONFIG_DIR: "C:\\isolated\\mcode" },
      },
    },
  });

  expect(Object.keys(clients)).toEqual(["mcode"]);
  expect(mockState.constructorSettings[0]).toEqual({
    command: { mode: "replace", argv: ["custom-mcode", "--verbose"] },
    env: { MCODE_CONFIG_DIR: "C:\\isolated\\mcode" },
    disallowedTools: undefined,
  });
});

test("rejects custom or legacy providers", () => {
  expect(() =>
    buildProviderRegistry(logger, {
      providerOverrides: {
        claude: { command: ["claude"] },
      },
    }),
  ).toThrow("this distribution is dedicated to MCode");
});

test("allows configured MCode models to replace runtime discovery", async () => {
  const registry = buildProviderRegistry(logger, {
    providerOverrides: {
      mcode: {
        models: [{ id: "novel-pro", label: "Novel Pro", isDefault: true }],
      },
    },
  });

  const catalog = await registry.mcode.fetchCatalog({ scope: "host" });
  expect(catalog.models).toEqual([
    expect.objectContaining({ provider: "mcode", id: "novel-pro", isDefault: true }),
  ]);
  expect(catalog.modes).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "default" })]),
  );
});

test("keeps exact MCP preapproval closed for MCode until its protocol supports it", () => {
  const registry = buildProviderRegistry(logger);
  const config: AgentSessionConfig = { provider: "mcode", cwd: "C:\\novels\\demo" };

  expect(() =>
    registry.mcode.applyToolPolicy(config, {
      preapproved: [{ kind: "mcp", server: "novel", tool: "save_scene" }],
    }),
  ).toThrow("does not support exact tool preapproval");
});
