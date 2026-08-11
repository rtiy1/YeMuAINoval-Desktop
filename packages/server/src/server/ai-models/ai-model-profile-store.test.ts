import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AiModelProfileStore } from "./ai-model-profile-store.js";
import { CredentialVault } from "./credential-vault.js";

function makeHome(): string {
  return mkdtempSync(path.join(os.tmpdir(), "yemu-ai-models-test-"));
}

const PROFILE = {
  id: "default",
  name: "默认档案",
  protocol: "anthropic" as const,
  baseUrl: null,
  model: "claude-sonnet-4-5",
  smallFastModel: null,
  contextWindow: null,
  maxOutputTokens: null,
  customHeaders: {},
  credentialId: "default",
  isDefault: true,
  enabled: true,
};

describe("AiModelProfileStore", () => {
  it("round-trips upserted profiles and persists them to disk", () => {
    const home = makeHome();
    try {
      const store = new AiModelProfileStore({ homeDir: home });
      expect(store.list()).toEqual([]);
      store.upsert(PROFILE);
      const reloaded = new AiModelProfileStore({ homeDir: home });
      expect(reloaded.list()).toEqual([PROFILE]);
      expect(reloaded.get("default")).toEqual(PROFILE);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("removes profiles and ignores unknown ids", () => {
    const home = makeHome();
    try {
      const store = new AiModelProfileStore({ homeDir: home });
      store.upsert(PROFILE);
      expect(store.remove("missing")).toBe(false);
      expect(store.remove("default")).toBe(true);
      expect(store.list()).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("falls back to empty state when the file is corrupt", () => {
    const home = makeHome();
    try {
      writeFileSync(path.join(home, "ai-models.json"), "{not json", "utf8");
      const store = new AiModelProfileStore({ homeDir: home });
      expect(store.list()).toEqual([]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("CredentialVault", () => {
  it("encrypts at rest, decrypts on read, and never stores plaintext", () => {
    const home = makeHome();
    try {
      const vault = new CredentialVault({ homeDir: home });
      vault.set("default", "api_key", "sk-ant-secret-value");
      const credential = vault.get("default");
      expect(credential).toEqual({ type: "api_key", value: "sk-ant-secret-value" });
      expect(vault.maskedValue("default")).toBe("…alue");
      expect(vault.has("default")).toBe(true);

      const filePath = path.join(home, "credentials", "default.json");
      const onDisk = readFileSync(filePath, "utf8");
      expect(onDisk).not.toContain("sk-ant-secret-value");
      expect(JSON.parse(onDisk)).toMatchObject({
        type: "api_key",
      });
      expect(JSON.parse(onDisk).ciphertext).toBeTruthy();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("separates credentials per profile", () => {
    const home = makeHome();
    try {
      const vault = new CredentialVault({ homeDir: home });
      vault.set("a", "api_key", "secret-a");
      vault.set("b", "auth_token", "secret-b");
      expect(vault.get("a")?.value).toBe("secret-a");
      expect(vault.get("b")?.value).toBe("secret-b");
      vault.remove("a");
      expect(vault.has("a")).toBe(false);
      expect(vault.has("b")).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
