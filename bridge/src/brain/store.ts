import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BRIDGE_HOME = join(homedir(), ".yemu", "bridge");

function ensureDir(): void {
  mkdirSync(BRIDGE_HOME, { recursive: true });
}

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(BRIDGE_HOME, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown): void {
  ensureDir();
  writeFileSync(join(BRIDGE_HOME, name), JSON.stringify(value, null, 2));
}

export interface WorkspaceBinding {
  space_id: string;
  email: string;
  user_id: string | null;
  workspace_root: string;
}

export interface Space {
  id: string;
  name: string;
  source_type: "legacy" | "folder" | "blank";
  root_path: string | null;
  created_at: number;
}

export interface ChatHistoryEntry {
  id: string;
  space_id: string | null;
  project_id: string;
  task_id: string;
  run_id: string | null;
  user_id: number | null;
  mode: "workforce" | "single-agent" | null;
  question: string;
  project_name?: string;
  summary?: string;
  tokens?: number;
  status: number;
  created_at: number;
}

export interface SnapshotEntry {
  id: string;
  api_task_id: string;
  camel_task_id: string;
  task_id: string;
  image_url?: string;
  image_path?: string;
  browser_url?: string;
  user_id?: number | null;
  created_at: number;
}

interface BridgeState {
  bindings: WorkspaceBinding[];
  spaces: Space[];
  histories: ChatHistoryEntry[];
  snapshots: SnapshotEntry[];
}

const EMPTY_STATE: BridgeState = {
  bindings: [],
  spaces: [],
  histories: [],
  snapshots: [],
};

export class BridgeStore {
  private state: BridgeState = readJson<BridgeState>("state.json", EMPTY_STATE);

  private save(): void {
    writeJson("state.json", this.state);
  }

  listBindings(): WorkspaceBinding[] {
    return this.state.bindings;
  }

  getBinding(email: string, spaceId: string, userId: string | null): WorkspaceBinding | null {
    return (
      this.state.bindings.find(
        (binding) =>
          binding.email === email &&
          binding.space_id === spaceId &&
          (binding.user_id ?? null) === userId,
      ) ?? null
    );
  }

  setBinding(binding: WorkspaceBinding): void {
    const index = this.state.bindings.findIndex(
      (existing) =>
        existing.space_id === binding.space_id &&
        existing.email === binding.email &&
        (existing.user_id ?? null) === binding.user_id,
    );
    if (index === -1) {
      this.state.bindings.push(binding);
    } else {
      this.state.bindings[index] = binding;
    }
    this.save();
  }

  removeBinding(spaceId: string): void {
    this.state.bindings = this.state.bindings.filter(
      (binding) => binding.space_id !== spaceId,
    );
    this.save();
  }

  listSpaces(): Space[] {
    return this.state.spaces;
  }

  getSpace(id: string): Space | null {
    return this.state.spaces.find((space) => space.id === id) ?? null;
  }

  setSpace(space: Space): void {
    const index = this.state.spaces.findIndex((existing) => existing.id === space.id);
    if (index === -1) {
      this.state.spaces.push(space);
    } else {
      this.state.spaces[index] = space;
    }
    this.save();
  }

  addHistory(entry: ChatHistoryEntry): ChatHistoryEntry {
    this.state.histories.push(entry);
    this.save();
    return entry;
  }

  updateHistory(id: string, patch: Partial<ChatHistoryEntry>): ChatHistoryEntry | null {
    const entry = this.state.histories.find((item) => item.id === id);
    if (!entry) {
      return null;
    }
    Object.assign(entry, patch);
    this.save();
    return entry;
  }

  deleteHistory(id: string): void {
    this.state.histories = this.state.histories.filter((item) => item.id !== id);
    this.save();
  }

  listHistories(): ChatHistoryEntry[] {
    return this.state.histories;
  }

  addSnapshot(snapshot: Omit<SnapshotEntry, "id" | "created_at">): SnapshotEntry {
    const entry: SnapshotEntry = {
      ...snapshot,
      id: `snap_${this.state.snapshots.length + 1}`,
      created_at: Date.now(),
    };
    this.state.snapshots.push(entry);
    this.save();
    return entry;
  }

  listSnapshots(): SnapshotEntry[] {
    return this.state.snapshots;
  }
}

export const bridgeStore = new BridgeStore();

export function sanitizeUserId(value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }
  return String(value).replace(/[\\/*?:"<>|\s]/g, "_");
}

export function scratchSpaceRoot(email: string, spaceId: string, userId: string | null): string {
  const ownerKey = sanitizeUserId(userId ?? email.split("@")[0]) ?? "local";
  return join(homedir(), "eigent", ownerKey, `space_${spaceId}`);
}
