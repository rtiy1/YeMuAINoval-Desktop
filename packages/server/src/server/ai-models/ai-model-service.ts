import type { Logger } from "pino";
import type {
  AiCredentialType,
  AiModelProfile,
  AiModelProfileWithCredential,
} from "@yemu/protocol/ai-models/schema";
import { AiModelProfileStore } from "./ai-model-profile-store.js";
import { CredentialVault, maskSecret } from "./credential-vault.js";

export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export interface AiModelServiceDeps {
  logger: Logger;
  profiles: AiModelProfileStore;
  credentials: CredentialVault;
}

export interface AiModelEnv {
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_SMALL_FAST_MODEL?: string;
  ANTHROPIC_CUSTOM_HEADERS?: string;
}

export class AiModelService {
  constructor(private readonly deps: AiModelServiceDeps) {}

  listProfiles(): AiModelProfileWithCredential[] {
    return this.deps.profiles.list().map((profile) => this.withCredentialStatus(profile));
  }

  upsertProfile(profile: AiModelProfile): AiModelProfileWithCredential {
    const stored = this.deps.profiles.upsert(profile);
    return this.withCredentialStatus(stored);
  }

  removeProfile(profileId: string): { removed: boolean; credentialRemoved: boolean } {
    const removed = this.deps.profiles.remove(profileId);
    const credentialRemoved = this.deps.credentials.remove(profileId);
    return { removed, credentialRemoved };
  }

  setCredential(
    profileId: string,
    type: AiCredentialType,
    value: string,
  ): { credentialId: string; hasCredential: boolean; maskedKey: string } {
    this.deps.credentials.set(profileId, type, value);
    return {
      credentialId: profileId,
      hasCredential: true,
      maskedKey: maskSecret(value),
    };
  }

  removeCredential(profileId: string): boolean {
    return this.deps.credentials.remove(profileId);
  }

  withCredentialStatus(profile: AiModelProfile): AiModelProfileWithCredential {
    const hasCredential = this.deps.credentials.has(profile.id);
    return {
      ...profile,
      hasCredential,
      maskedKey: hasCredential ? this.deps.credentials.maskedValue(profile.id) : null,
    };
  }

  resolveProfileEnv(profileId: string): AiModelEnv | null {
    const profile = this.deps.profiles.get(profileId);
    if (!profile) {
      return null;
    }
    const credential = this.deps.credentials.get(profile.id);
    const env: AiModelEnv = {
      ANTHROPIC_BASE_URL: profile.baseUrl ?? undefined,
      ANTHROPIC_MODEL: profile.model,
      ...(profile.smallFastModel ? { ANTHROPIC_SMALL_FAST_MODEL: profile.smallFastModel } : {}),
      ...(profile.customHeaders && Object.keys(profile.customHeaders).length > 0
        ? { ANTHROPIC_CUSTOM_HEADERS: JSON.stringify(profile.customHeaders) }
        : {}),
    };
    if (credential) {
      if (credential.type === "auth_token") {
        env.ANTHROPIC_AUTH_TOKEN = credential.value;
      } else {
        env.ANTHROPIC_API_KEY = credential.value;
      }
    }
    return env;
  }

  async testConnection(profileId: string): Promise<{
    ok: boolean;
    latencyMs: number | null;
    authOk: boolean | null;
    modelAvailable: boolean | null;
    message: string | null;
  }> {
    const profile = this.deps.profiles.get(profileId);
    if (!profile) {
      return {
        ok: false,
        latencyMs: null,
        authOk: null,
        modelAvailable: null,
        message: "模型档案不存在",
      };
    }
    const credential = this.deps.credentials.get(profile.id);
    if (!credential) {
      return {
        ok: false,
        latencyMs: null,
        authOk: null,
        modelAvailable: null,
        message: "尚未配置 API Key",
      };
    }

    const baseUrl = (profile.baseUrl ?? DEFAULT_ANTHROPIC_BASE_URL).replace(/\/+$/, "");
    const startedAt = Date.now();
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(credential.type === "auth_token"
          ? { authorization: `Bearer ${credential.value}` }
          : { "x-api-key": credential.value }),
        ...profile.customHeaders,
      };
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: profile.model,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const latencyMs = Date.now() - startedAt;
      if (response.ok) {
        return { ok: true, latencyMs, authOk: true, modelAvailable: true, message: null };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          latencyMs,
          authOk: false,
          modelAvailable: null,
          message: `鉴权失败（HTTP ${response.status}）`,
        };
      }
      if (response.status === 404) {
        return {
          ok: false,
          latencyMs,
          authOk: true,
          modelAvailable: false,
          message: "模型 ID 不可用（HTTP 404）",
        };
      }
      return {
        ok: false,
        latencyMs,
        authOk: null,
        modelAvailable: null,
        message: `连接失败（HTTP ${response.status}）`,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.debug({ err: error, profileId }, "AI model test connection failed");
      return { ok: false, latencyMs, authOk: null, modelAvailable: null, message };
    }
  }
}
