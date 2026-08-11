import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AiModelProfileSchema, type AiModelProfile } from "@yemu/protocol/ai-models/schema";

const AI_MODELS_FILENAME = "ai-models.json";

const StoredProfilesSchema = z.object({
  version: z.literal(1),
  profiles: z.array(AiModelProfileSchema).default([]),
});

export interface AiModelProfileStoreDeps {
  homeDir: string;
  readFile?: typeof readFileSync;
  writeFile?: typeof writeFileSync;
}

export class AiModelProfileStore {
  private readonly filePath: string;
  private readonly readFile: typeof readFileSync;
  private readonly writeFile: typeof writeFileSync;

  constructor(deps: AiModelProfileStoreDeps) {
    this.filePath = path.join(deps.homeDir, AI_MODELS_FILENAME);
    this.readFile = deps.readFile ?? readFileSync;
    this.writeFile = deps.writeFile ?? writeFileSync;
  }

  list(): AiModelProfile[] {
    return this.load().profiles;
  }

  get(profileId: string): AiModelProfile | null {
    return this.list().find((profile) => profile.id === profileId) ?? null;
  }

  upsert(input: AiModelProfile): AiModelProfile {
    const existing = this.load();
    const nextProfiles = existing.profiles.filter((profile) => profile.id !== input.id);
    const upserted: AiModelProfile = { ...input, id: input.id || randomUUID() };
    nextProfiles.push(upserted);
    this.save({ ...existing, profiles: nextProfiles });
    return upserted;
  }

  remove(profileId: string): boolean {
    const existing = this.load();
    const nextProfiles = existing.profiles.filter((profile) => profile.id !== profileId);
    if (nextProfiles.length === existing.profiles.length) {
      return false;
    }
    this.save({ ...existing, profiles: nextProfiles });
    return true;
  }

  private load(): z.infer<typeof StoredProfilesSchema> {
    let raw: string;
    try {
      raw = this.readFile(this.filePath, "utf8");
    } catch {
      return { version: 1, profiles: [] };
    }
    try {
      const parsed = StoredProfilesSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : { version: 1, profiles: [] };
    } catch {
      return { version: 1, profiles: [] };
    }
  }

  private save(next: z.infer<typeof StoredProfilesSchema>): void {
    this.writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }
}
