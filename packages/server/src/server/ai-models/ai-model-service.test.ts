import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { AiModelService } from "./ai-model-service.js";
import { AiModelProfileStore } from "./ai-model-profile-store.js";
import { CredentialVault } from "./credential-vault.js";

function createService(home: string): AiModelService {
  return new AiModelService({
    logger: pino({ level: "silent" }),
    profiles: new AiModelProfileStore({ homeDir: home }),
    credentials: new CredentialVault({ homeDir: home }),
  });
}

const PROFILE = {
  id: "default",
  name: "默认档案",
  protocol: "anthropic" as const,
  baseUrl: null,
  model: "claude-sonnet-4-5",
  smallFastModel: "claude-haiku-4-5",
  contextWindow: null,
  maxOutputTokens: null,
  customHeaders: {},
  credentialId: "default",
  isDefault: true,
  enabled: true,
};

describe("AiModelService", () => {
  it("resolves profile env into ANTHROPIC_* variables with the credential", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "yemu-ai-service-test-"));
    try {
      const service = createService(home);
      service.upsertProfile(PROFILE);
      service.setCredential("default", "api_key", "sk-ant-secret");

      const env = service.resolveProfileEnv("default");
      expect(env).toEqual({
        ANTHROPIC_MODEL: "claude-sonnet-4-5",
        ANTHROPIC_SMALL_FAST_MODEL: "claude-haiku-4-5",
        ANTHROPIC_API_KEY: "sk-ant-secret",
      });
      expect(env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("maps auth tokens and base URLs and custom headers", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "yemu-ai-service-test-"));
    try {
      const service = createService(home);
      service.upsertProfile({
        ...PROFILE,
        id: "compat",
        baseUrl: "https://proxy.example.com",
        customHeaders: { "x-custom": "yes" },
      });
      service.setCredential("compat", "auth_token", "token-value");

      const env = service.resolveProfileEnv("compat");
      expect(env?.ANTHROPIC_BASE_URL).toBe("https://proxy.example.com");
      expect(env?.ANTHROPIC_AUTH_TOKEN).toBe("token-value");
      expect(env?.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env?.ANTHROPIC_CUSTOM_HEADERS).toBe('{"x-custom":"yes"}');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("never leaks credentials across profiles and returns null for unknown profiles", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "yemu-ai-service-test-"));
    try {
      const service = createService(home);
      service.upsertProfile(PROFILE);
      service.setCredential("default", "api_key", "secret-a");

      expect(service.resolveProfileEnv("missing")).toBeNull();

      const list = service.listProfiles();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: "default",
        hasCredential: true,
        maskedKey: "…et-a",
      });
      expect(JSON.stringify(list)).not.toContain("secret-a");

      service.removeCredential("default");
      expect(service.listProfiles()[0]?.hasCredential).toBe(false);
      expect(service.resolveProfileEnv("default")?.ANTHROPIC_API_KEY).toBeUndefined();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
