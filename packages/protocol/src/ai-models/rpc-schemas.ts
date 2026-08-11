import { z } from "zod";
import {
  AiCredentialTypeSchema,
  AiModelProfileSchema,
  AiModelProfileWithCredentialSchema,
} from "./schema.js";

export const AiModelsListRequestSchema = z.object({
  type: z.literal("ai.models.list.request"),
  requestId: z.string(),
});

export const AiModelsListResponseSchema = z.object({
  type: z.literal("ai.models.list.response"),
  payload: z.object({
    requestId: z.string(),
    profiles: z.array(AiModelProfileWithCredentialSchema).default([]),
  }),
});

export const AiModelsUpsertRequestSchema = z.object({
  type: z.literal("ai.models.upsert.request"),
  requestId: z.string(),
  profile: AiModelProfileSchema,
});

export const AiModelsUpsertResponseSchema = z.object({
  type: z.literal("ai.models.upsert.response"),
  payload: z.object({
    requestId: z.string(),
    profile: AiModelProfileWithCredentialSchema,
  }),
});

export const AiModelsRemoveRequestSchema = z.object({
  type: z.literal("ai.models.remove.request"),
  requestId: z.string(),
  profileId: z.string(),
});

export const AiModelsRemoveResponseSchema = z.object({
  type: z.literal("ai.models.remove.response"),
  payload: z.object({
    requestId: z.string(),
    removed: z.boolean(),
  }),
});

export const AiModelsTestRequestSchema = z.object({
  type: z.literal("ai.models.test.request"),
  requestId: z.string(),
  profileId: z.string(),
});

export const AiModelsTestResponseSchema = z.object({
  type: z.literal("ai.models.test.response"),
  payload: z.object({
    requestId: z.string(),
    ok: z.boolean(),
    latencyMs: z.number().int().nonnegative().nullable(),
    authOk: z.boolean().nullable(),
    modelAvailable: z.boolean().nullable(),
    message: z.string().nullable(),
  }),
});

export const AiCredentialsSetRequestSchema = z.object({
  type: z.literal("ai.credentials.set.request"),
  requestId: z.string(),
  profileId: z.string(),
  credentialType: AiCredentialTypeSchema,
  credentialValue: z.string().min(1).max(4096),
});

export const AiCredentialsSetResponseSchema = z.object({
  type: z.literal("ai.credentials.set.response"),
  payload: z.object({
    requestId: z.string(),
    credentialId: z.string(),
    hasCredential: z.boolean(),
    maskedKey: z.string(),
  }),
});

export const AiCredentialsRemoveRequestSchema = z.object({
  type: z.literal("ai.credentials.remove.request"),
  requestId: z.string(),
  profileId: z.string(),
});

export const AiCredentialsRemoveResponseSchema = z.object({
  type: z.literal("ai.credentials.remove.response"),
  payload: z.object({
    requestId: z.string(),
    removed: z.boolean(),
  }),
});
