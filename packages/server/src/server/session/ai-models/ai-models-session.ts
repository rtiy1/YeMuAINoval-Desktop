import type pino from "pino";
import type {
  AiCredentialsRemoveRequestMessage,
  AiCredentialsSetRequestMessage,
  AiModelsListRequestMessage,
  AiModelsRemoveRequestMessage,
  AiModelsTestRequestMessage,
  AiModelsUpsertRequestMessage,
} from "@yemu/protocol/messages";
import type { SessionOutboundMessage } from "@yemu/protocol/messages";
import type { AiModelService, AiModelEnv } from "../../ai-models/ai-model-service.js";

export interface AiModelsSessionOptions {
  host: {
    emit: (msg: SessionOutboundMessage) => void;
  };
  service: AiModelService | undefined;
  logger: pino.Logger;
}

export class AiModelsSession {
  private readonly host: AiModelsSessionOptions["host"];
  private readonly service: AiModelService | null;
  private readonly logger: pino.Logger;

  constructor(options: AiModelsSessionOptions) {
    this.host = options.host;
    this.service = options.service ?? null;
    this.logger = options.logger;
  }

  async handleListRequest(msg: AiModelsListRequestMessage): Promise<void> {
    const service = this.requireService();
    this.host.emit({
      type: "ai.models.list.response",
      payload: {
        requestId: msg.requestId,
        profiles: service.listProfiles(),
      },
    });
  }

  async handleUpsertRequest(msg: AiModelsUpsertRequestMessage): Promise<void> {
    const service = this.requireService();
    try {
      const profile = service.upsertProfile(msg.profile);
      this.host.emit({
        type: "ai.models.upsert.response",
        payload: {
          requestId: msg.requestId,
          profile,
        },
      });
    } catch (error) {
      this.logger.error({ err: error }, "Failed to upsert AI model profile");
      throw error;
    }
  }

  async handleRemoveRequest(msg: AiModelsRemoveRequestMessage): Promise<void> {
    const service = this.requireService();
    const { removed } = service.removeProfile(msg.profileId);
    this.host.emit({
      type: "ai.models.remove.response",
      payload: {
        requestId: msg.requestId,
        removed,
      },
    });
  }

  async handleTestRequest(msg: AiModelsTestRequestMessage): Promise<void> {
    const service = this.requireService();
    try {
      const result = await service.testConnection(msg.profileId);
      this.host.emit({
        type: "ai.models.test.response",
        payload: {
          requestId: msg.requestId,
          ...result,
        },
      });
    } catch (error) {
      this.logger.error({ err: error }, "AI model test connection failed");
      throw error;
    }
  }

  async handleCredentialSetRequest(msg: AiCredentialsSetRequestMessage): Promise<void> {
    const service = this.requireService();
    try {
      const result = service.setCredential(msg.profileId, msg.credentialType, msg.credentialValue);
      this.host.emit({
        type: "ai.credentials.set.response",
        payload: {
          requestId: msg.requestId,
          ...result,
        },
      });
    } catch (error) {
      this.logger.error({ err: error }, "Failed to store AI model credential");
      throw error;
    }
  }

  async handleCredentialRemoveRequest(msg: AiCredentialsRemoveRequestMessage): Promise<void> {
    const service = this.requireService();
    const removed = service.removeCredential(msg.profileId);
    this.host.emit({
      type: "ai.credentials.remove.response",
      payload: {
        requestId: msg.requestId,
        removed,
      },
    });
  }

  resolveProfileEnv(profileId: string): AiModelEnv | null {
    if (!this.service) {
      return null;
    }
    return this.service.resolveProfileEnv(profileId);
  }

  private requireService(): AiModelService {
    if (!this.service) {
      throw new Error("AI model service is not available");
    }
    return this.service;
  }
}
