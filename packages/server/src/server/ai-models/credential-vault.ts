import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AiCredentialType } from "@yemu/protocol/ai-models/schema";

/**
 * File-backed credential vault for AI model API secrets.
 *
 * Secrets are encrypted with AES-256-GCM under a random machine-bound key kept
 * in the same private directory (0600). The daemon is a localhost-only process,
 * so this matches the protection level of the daemon's own config.json. Values
 * are only decrypted while a MCode session is being launched or a connection is
 * tested; they are never logged, persisted in plaintext, or returned to clients.
 */
const CREDENTIALS_DIRNAME = "credentials";
const KEY_FILENAME = "key";
const ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;

export interface EncryptedCredential {
  type: AiCredentialType;
  nonce: string;
  authTag: string;
  ciphertext: string;
}

export interface CredentialVaultDeps {
  homeDir: string;
}

export class CredentialVault {
  private readonly credentialsDir: string;
  private readonly keyPath: string;

  constructor(deps: CredentialVaultDeps) {
    this.credentialsDir = path.join(deps.homeDir, CREDENTIALS_DIRNAME);
    this.keyPath = path.join(this.credentialsDir, KEY_FILENAME);
  }

  set(profileId: string, type: AiCredentialType, value: string): string {
    mkdirSync(this.credentialsDir, { recursive: true, mode: 0o700 });
    const key = this.loadOrCreateKey();
    const nonce = randomBytes(IV_BYTE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const stored: EncryptedCredential = {
      type,
      nonce: nonce.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    writeFileSync(
      path.join(this.credentialsDir, `${sanitizeProfileId(profileId)}.json`),
      `${JSON.stringify(stored)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    return profileId;
  }

  get(profileId: string): { type: AiCredentialType; value: string } | null {
    const filePath = path.join(this.credentialsDir, `${sanitizeProfileId(profileId)}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    const key = this.loadKey();
    if (!key) {
      return null;
    }
    try {
      const stored = JSON.parse(readFileSync(filePath, "utf8")) as EncryptedCredential;
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(stored.nonce, "base64"));
      decipher.setAuthTag(Buffer.from(stored.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(stored.ciphertext, "base64")),
        decipher.final(),
      ]);
      return { type: stored.type, value: plaintext.toString("utf8") };
    } catch {
      return null;
    }
  }

  remove(profileId: string): boolean {
    const filePath = path.join(this.credentialsDir, `${sanitizeProfileId(profileId)}.json`);
    if (!existsSync(filePath)) {
      return false;
    }
    writeFileSync(filePath, "", { encoding: "utf8" });
    return true;
  }

  maskedValue(profileId: string): string | null {
    const credential = this.get(profileId);
    if (!credential) {
      return null;
    }
    return maskSecret(credential.value);
  }

  has(profileId: string): boolean {
    return this.get(profileId) !== null;
  }

  private loadOrCreateKey(): Buffer {
    const existing = this.loadKey();
    if (existing) {
      return existing;
    }
    const key = randomBytes(32);
    writeFileSync(this.keyPath, key, { encoding: "binary", mode: 0o600 });
    return key;
  }

  private loadKey(): Buffer | null {
    if (!existsSync(this.keyPath)) {
      return null;
    }
    return readFileSync(this.keyPath);
  }
}

export function maskSecret(value: string): string {
  if (value.length <= 4) {
    return "…****";
  }
  return `…${value.slice(-4)}`;
}

function sanitizeProfileId(profileId: string): string {
  return profileId.replace(/[^a-zA-Z0-9._-]/g, "_");
}
