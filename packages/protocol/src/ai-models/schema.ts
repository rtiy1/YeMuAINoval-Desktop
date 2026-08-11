import { z } from "zod";

export const AiProtocolSchema = z.enum(["anthropic", "anthropic-compatible"]);

export type AiProtocol = z.infer<typeof AiProtocolSchema>;

export const AiCredentialTypeSchema = z.enum(["api_key", "auth_token"]);

export type AiCredentialType = z.infer<typeof AiCredentialTypeSchema>;

export const AiModelProfileSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  protocol: AiProtocolSchema,
  baseUrl: z.string().trim().url().nullable(),
  model: z.string().trim().min(1).max(200),
  smallFastModel: z.string().trim().min(1).max(200).nullable(),
  contextWindow: z.number().int().positive().nullable(),
  maxOutputTokens: z.number().int().positive().nullable(),
  customHeaders: z.record(z.string(), z.string()).default({}),
  credentialId: z.string().nullable(),
  isDefault: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export type AiModelProfile = z.infer<typeof AiModelProfileSchema>;

/** Client-visible credential status. Plaintext secrets never cross the wire. */
export const AiCredentialStatusSchema = z.object({
  credentialId: z.string().nullable(),
  hasCredential: z.boolean(),
  /** Masked hint of the stored secret, e.g. "…abcd". Null when no credential is set. */
  maskedKey: z.string().nullable(),
});

export type AiCredentialStatus = z.infer<typeof AiCredentialStatusSchema>;

export const AiModelProfileWithCredentialSchema = AiModelProfileSchema.omit({
  credentialId: true,
}).extend({
  credentialId: z.string().nullable(),
  hasCredential: z.boolean(),
  maskedKey: z.string().nullable(),
});

export type AiModelProfileWithCredential = z.infer<typeof AiModelProfileWithCredentialSchema>;
