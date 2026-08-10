import { z } from "zod";
import type { AgentMode } from "./agent-types.js";

export type AgentModeColorTier = "safe" | "moderate" | "dangerous" | "planning" | `#${string}`;
// Open string by design: the client looks icons up in a registry and falls back
// to a default for unknown values. Daemon downgrades unknown icons for clients
// that pre-date the open-string contract (see CLIENT_CAPS.customModeIcons).
export type AgentModeIcon = string;

export interface AgentModeVisuals {
  icon: AgentModeIcon;
  colorTier: AgentModeColorTier;
}

export type AgentProviderModeDefinition = Omit<AgentMode, "icon" | "colorTier"> &
  AgentModeVisuals & {
    // Marks the provider's most-permissioned no-prompt mode. Selecting it means tools run without approval; the runtime mechanism is provider-specific.
    isUnattended?: boolean;
  };

// TODO: `modes` should not be static. Providers (especially ACP) report their
// own modes at runtime via session/new. We should fetch modes from the provider
// as source of truth and enrich with UI metadata (icons, colorTier) on top.
export interface AgentProviderDefinition {
  id: string;
  label: string;
  description: string;
  enabledByDefault?: boolean;
  defaultModeId: string | null;
  modes: AgentProviderModeDefinition[];
  voice?: {
    enabled: boolean;
    defaultModeId: string;
    defaultModel?: string;
  };
}

const MCODE_MODES: AgentProviderModeDefinition[] = [
  {
    id: "plan",
    label: "Plan",
    description: "Read and plan without changing the novel project",
    icon: "ShieldEllipsis",
    colorTier: "planning",
  },
  {
    id: "default",
    label: "Always Ask",
    description: "Ask before MCode uses tools that need permission",
    icon: "Shield",
    colorTier: "safe",
  },
  {
    id: "acceptEdits",
    label: "Accept Edits",
    description: "Automatically allow edits while keeping other permission checks",
    icon: "ShieldPlus",
    colorTier: "moderate",
  },
  {
    id: "bypassPermissions",
    label: "Full Access",
    description: "Run all MCode tools without permission prompts",
    icon: "ShieldOff",
    colorTier: "dangerous",
    isUnattended: true,
  },
];

// Kept only so the dormant upstream OMP adapter continues to compile. It is
// intentionally absent from AGENT_PROVIDER_DEFINITIONS and cannot be selected.
export const OMP_MODES: AgentProviderModeDefinition[] = [
  {
    id: "full",
    label: "Full Access",
    description: "Run tools without prompts.",
    icon: "ShieldOff",
    colorTier: "dangerous",
    isUnattended: true,
  },
  {
    id: "write",
    label: "Write Approval",
    description: "Require approval for write operations.",
    icon: "ShieldAlert",
    colorTier: "moderate",
  },
  {
    id: "ask",
    label: "Always Ask",
    description: "Require approval for write and execution tools.",
    icon: "ShieldCheck",
    colorTier: "safe",
  },
];

const MOCK_LOAD_TEST_MODES: AgentProviderModeDefinition[] = [
  {
    id: "load-test",
    label: "Load Test",
    description: "Streams repeated markdown, reasoning, and tool calls for app stress testing",
    icon: "ShieldOff",
    colorTier: "dangerous",
  },
  {
    id: "approval-test",
    label: "Approval Test",
    description: "Alternate development-only permission mode for preference tests",
    icon: "ShieldCheck",
    colorTier: "safe",
  },
];

const MOCK_SLOW_MODES: AgentProviderModeDefinition[] = [
  {
    id: "default",
    label: "Default",
    description: "Dev-only mode for the mock slow provider",
    icon: "ShieldOff",
    colorTier: "dangerous",
  },
];

export const AGENT_PROVIDER_DEFINITIONS: AgentProviderDefinition[] = [
  {
    id: "mcode",
    label: "MCode",
    description: "The dedicated AI agent for the YeMu novel writing workspace",
    defaultModeId: "default",
    modes: MCODE_MODES,
    voice: {
      enabled: true,
      defaultModeId: "default",
      defaultModel: "sonnet",
    },
  },
];

export const DEV_AGENT_PROVIDER_DEFINITIONS: AgentProviderDefinition[] = [
  {
    id: "mock",
    label: "Mock Load Test",
    description:
      "Development-only provider that emits synthetic agent traffic for performance tests",
    defaultModeId: "load-test",
    modes: MOCK_LOAD_TEST_MODES,
  },
  {
    id: "mock-slow",
    label: "Mock Slow Provider",
    description: "Dev-only: hangs during model discovery to test loading and timeout UI",
    defaultModeId: "default",
    modes: MOCK_SLOW_MODES,
  },
];

export function getAgentProviderDefinition(
  provider: string,
  definitions: AgentProviderDefinition[] = [
    ...AGENT_PROVIDER_DEFINITIONS,
    ...DEV_AGENT_PROVIDER_DEFINITIONS,
  ],
): AgentProviderDefinition {
  const definition = definitions.find((entry) => entry.id === provider);
  if (!definition) {
    throw new Error(`Unknown agent provider: ${provider}`);
  }
  return definition;
}

export const BUILTIN_PROVIDER_IDS = AGENT_PROVIDER_DEFINITIONS.map((d) => d.id);
export const AGENT_PROVIDER_IDS = BUILTIN_PROVIDER_IDS;

export const AgentProviderSchema = z.string();

export function isValidAgentProvider(
  value: string,
  validIds: Iterable<string> = BUILTIN_PROVIDER_IDS,
): boolean {
  return Array.isArray(validIds) ? validIds.includes(value) : new Set(validIds).has(value);
}

export function getUnattendedModeId(
  provider: string,
  definitions: AgentProviderDefinition[] = [
    ...AGENT_PROVIDER_DEFINITIONS,
    ...DEV_AGENT_PROVIDER_DEFINITIONS,
  ],
): string | undefined {
  const definition = definitions.find((entry) => entry.id === provider);
  return definition?.modes.find((mode) => mode.isUnattended)?.id;
}

export function getModeVisuals(
  provider: string,
  modeId: string,
  definitions: AgentProviderDefinition[],
): AgentModeVisuals | undefined {
  const definition = definitions.find((entry) => entry.id === provider);
  const mode = definition?.modes.find((m) => m.id === modeId);
  if (!mode) return undefined;
  return { icon: mode.icon, colorTier: mode.colorTier };
}
