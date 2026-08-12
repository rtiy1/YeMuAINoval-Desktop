import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { bridgeStore, type Space } from "./store.js";

const STORE_HOME = join(homedir(), ".yemu", "bridge");

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }
  return JSON.parse(raw);
}

// ---- Local identity: a JWT-shaped token so the frontend can decode user_id ----
function makeLocalToken(userId: number, email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: String(userId), user_id: userId, email, iat: Math.floor(Date.now() / 1000) }),
  ).toString("base64url");
  return `${header}.${payload}.local`;
}

interface ProviderRecord {
  id: number;
  provider_name: string;
  model_type: string;
  api_key: string;
  endpoint_url: string | null;
  api_url: string | null;
  encrypted_config: string | null;
  is_default: boolean;
  created_at: number;
}

interface ApiV1State {
  nextProviderId: number;
  providers: ProviderRecord[];
  configs: Record<string, unknown>;
  key: string;
}

function loadState(): ApiV1State {
  try {
    return JSON.parse(readFileSync(join(STORE_HOME, "api-v1.json"), "utf8")) as ApiV1State;
  } catch {
    return { nextProviderId: 1, providers: [], configs: {}, key: "" };
  }
}

function saveState(state: ApiV1State): void {
  mkdirSync(STORE_HOME, { recursive: true });
  writeFileSync(join(STORE_HOME, "api-v1.json"), JSON.stringify(state, null, 2));
}

function ensureDefaultProvider(state: ApiV1State): ProviderRecord {
  if (state.providers.length > 0) {
    return state.providers.find((provider) => provider.is_default) ?? state.providers[0];
  }
  const provider: ProviderRecord = {
    id: state.nextProviderId++,
    provider_name: "custom",
    model_type: process.env.YEMU_DEFAULT_MODEL ?? "claude-sonnet-4-5",
    api_key: process.env.ANTHROPIC_API_KEY ?? "",
    endpoint_url: process.env.ANTHROPIC_BASE_URL ?? null,
    api_url: process.env.ANTHROPIC_BASE_URL ?? null,
    encrypted_config: null,
    is_default: true,
    created_at: Date.now(),
  };
  state.providers.push(provider);
  saveState(state);
  return provider;
}

export async function handleApiV1(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): Promise<void> {
  const method = req.method ?? "GET";
  const state = loadState();

  // ---- Auth ----
  if (pathname === "/api/v1/user/auto-login" && method === "POST") {
    const email = "local@yemu.local";
    const token = makeLocalToken(1, email);
    json(res, 200, {
      email,
      username: "YeMu",
      token,
      user_id: 1,
      model_type: "custom",
      is_first_launch: true,
    });
    return;
  }
  if (pathname === "/api/v1/register" && method === "POST") {
    const body = await readJsonBody(req);
    json(res, 200, { email: body.email ?? "local@yemu.local" });
    return;
  }
  if (pathname === "/api/v1/user" && method === "GET") {
    json(res, 200, {
      id: 1,
      email: "local@yemu.local",
      username: "YeMu",
      avatar: null,
      plan: "local",
    });
    return;
  }
  if (pathname === "/api/v1/user/key" && method === "GET") {
    json(res, 200, {
      value: state.key || ensureDefaultProvider(state).api_key,
      api_url: ensureDefaultProvider(state).api_url,
    });
    return;
  }
  if (pathname === "/api/v1/user/current_credits" && method === "GET") {
    json(res, 200, { credits: -1, is_unlimited: true });
    return;
  }
  if (pathname === "/api/v1/user/privacy" && method === "GET") {
    json(res, 200, { help_improve: false });
    return;
  }
  if (pathname === "/api/v1/user/privacy" && method === "PUT") {
    json(res, 200, { success: true });
    return;
  }
  if (pathname === "/api/v1/user/invite_code" && method === "GET") {
    json(res, 200, { invite_code: "LOCAL" });
    return;
  }
  if (pathname === "/api/v1/subscription" && method === "GET") {
    json(res, 200, { plan: "local", status: "active", is_enterprise: false });
    return;
  }
  if (pathname === "/api/v1/upgrade-trial-to-paid" && method === "POST") {
    json(res, 200, { success: true });
    return;
  }

  // ---- Providers ----
  if (pathname === "/api/v1/providers" && method === "GET") {
    const prefer = url.searchParams.get("prefer") === "true";
    const items = state.providers.length > 0 ? state.providers : [ensureDefaultProvider(state)];
    if (prefer) {
      const preferred = items.find((provider) => provider.is_default) ?? items[0];
      json(res, 200, { items: [preferred] });
      return;
    }
    json(res, 200, { items });
    return;
  }
  if (pathname === "/api/v1/provider" && method === "POST") {
    const body = await readJsonBody(req);
    const provider: ProviderRecord = {
      id: state.nextProviderId++,
      provider_name: String(body.provider_name ?? "custom"),
      model_type: String(body.model_type ?? "claude-sonnet-4-5"),
      api_key: body.api_key != null ? String(body.api_key) : "",
      endpoint_url: body.endpoint_url != null ? String(body.endpoint_url) : null,
      api_url: body.api_url != null ? String(body.api_url) : null,
      encrypted_config: body.encrypted_config != null ? String(body.encrypted_config) : null,
      is_default: state.providers.length === 0,
      created_at: Date.now(),
    };
    state.providers.push(provider);
    saveState(state);
    json(res, 200, provider);
    return;
  }
  if (pathname === "/api/v1/provider/prefer" && method === "POST") {
    const body = await readJsonBody(req);
    const providerId = Number(body.provider_id);
    for (const provider of state.providers) {
      provider.is_default = provider.id === providerId;
    }
    saveState(state);
    json(res, 200, { success: true });
    return;
  }
  if (pathname === "/api/v1/remote-sub-agent-providers" && method === "GET") {
    json(res, 200, { items: [] });
    return;
  }
  if (pathname === "/api/v1/remote-sub-agent-providers" && method === "POST") {
    json(res, 200, { success: true });
    return;
  }

  // ---- Configs ----
  if (pathname === "/api/v1/config/info" && method === "GET") {
    json(res, 200, { success: true, config: state.configs });
    return;
  }
  if (pathname === "/api/v1/configs" && method === "GET") {
    json(res, 200, { success: true, configs: state.configs });
    return;
  }
  if (pathname === "/api/v1/configs" && method === "POST") {
    const body = await readJsonBody(req);
    state.configs = { ...state.configs, ...body };
    saveState(state);
    json(res, 200, { success: true, configs: state.configs });
    return;
  }

  // ---- MCP users ----
  if (pathname === "/api/v1/mcp/users" && method === "GET") {
    json(res, 200, { users: [] });
    return;
  }
  if (pathname === "/api/v1/mcp/import/remote" && method === "POST") {
    json(res, 200, { success: true });
    return;
  }

  // ---- Server capabilities ----
  if (pathname === "/api/v1/server/capabilities" && method === "GET") {
    json(res, 200, { capabilities: [] });
    return;
  }

  // ---- Spaces ----
  if (pathname === "/api/v1/spaces" && method === "GET") {
    json(res, 200, { items: bridgeStore.listSpaces() });
    return;
  }
  if (pathname === "/api/v1/spaces" && method === "POST") {
    const body = await readJsonBody(req);
    const space: Space = {
      id: String(body.id ?? `space_${randomUUID().slice(0, 8)}`),
      name: String(body.name ?? "New Space"),
      source_type:
        body.source_type === "legacy" || body.source_type === "folder"
          ? body.source_type
          : "blank",
      root_path: body.root_path != null ? String(body.root_path) : null,
      created_at: Date.now(),
    };
    bridgeStore.setSpace(space);
    json(res, 200, space);
    return;
  }
  if (pathname === "/api/v1/spaces/legacy" && method === "POST") {
    const space: Space = {
      id: `legacy_${randomUUID().slice(0, 8)}`,
      name: "Default Workspace",
      source_type: "legacy",
      root_path: null,
      created_at: Date.now(),
    };
    bridgeStore.setSpace(space);
    json(res, 200, space);
    return;
  }

  // ---- Chat history ----
  if (pathname === "/api/v1/chat/history" && method === "POST") {
    const body = await readJsonBody(req);
    const entry = bridgeStore.addHistory({
      id: `hist_${randomUUID().slice(0, 12)}`,
      space_id: body.space_id != null ? String(body.space_id) : null,
      project_id: String(body.project_id ?? ""),
      task_id: String(body.task_id ?? ""),
      run_id: body.run_id != null ? String(body.run_id) : null,
      user_id: body.user_id != null ? Number(body.user_id) : null,
      mode: body.mode === "single-agent" ? "single-agent" : body.mode === "workforce" ? "workforce" : null,
      question: String(body.question ?? ""),
      project_name: body.project_name != null ? String(body.project_name) : undefined,
      summary: body.summary != null ? String(body.summary) : undefined,
      tokens: body.tokens != null ? Number(body.tokens) : undefined,
      status: 1,
      created_at: Date.now(),
    });
    json(res, 200, entry);
    return;
  }
  const historyItemMatch = pathname.match(/^\/api\/v1\/chat\/history\/([^/]+)$/);
  if (historyItemMatch && method === "PUT") {
    const body = await readJsonBody(req);
    const patch: Record<string, unknown> = {};
    if (body.project_name != null) patch.project_name = String(body.project_name);
    if (body.summary != null) patch.summary = String(body.summary);
    if (body.tokens != null) patch.tokens = Number(body.tokens);
    if (body.status != null) patch.status = Number(body.status);
    const updated = bridgeStore.updateHistory(historyItemMatch[1], patch);
    json(res, 200, updated ?? { success: false });
    return;
  }
  if (historyItemMatch && method === "DELETE") {
    bridgeStore.deleteHistory(historyItemMatch[1]);
    json(res, 200, { success: true });
    return;
  }
  if (pathname === "/api/v1/chat/histories" && method === "GET") {
    json(res, 200, { items: bridgeStore.listHistories() });
    return;
  }
  const groupedMatch = pathname.match(/^\/api\/v1\/chat\/histories\/grouped(?:\/([^/]+))?$/);
  if (groupedMatch && method === "GET") {
    const projectIdFilter = groupedMatch[1] ? decodeURIComponent(groupedMatch[1]) : null;
    const includeTasks = url.searchParams.get("include_tasks") !== "false";
    const spaceId = url.searchParams.get("space_id");
    let histories = bridgeStore.listHistories();
    if (projectIdFilter) {
      histories = histories.filter((entry) => entry.project_id === projectIdFilter);
    }
    if (spaceId) {
      histories = histories.filter((entry) => entry.space_id === spaceId);
    }
    json(res, 200, {
      projects: groupHistories(histories, includeTasks),
    });
    return;
  }

  // ---- Snapshots ----
  if (pathname === "/api/v1/chat/snapshots" && method === "GET") {
    json(res, 200, bridgeStore.listSnapshots());
    return;
  }
  if (pathname === "/api/v1/chat/snapshots" && method === "POST") {
    const body = await readJsonBody(req);
    bridgeStore.addSnapshot({
      api_task_id: body.api_task_id != null ? String(body.api_task_id) : "",
      camel_task_id: body.camel_task_id != null ? String(body.camel_task_id) : "",
      task_id: body.task_id != null ? String(body.task_id) : "",
      image_url: body.image_url != null ? String(body.image_url) : undefined,
      image_path: body.image_path != null ? String(body.image_path) : undefined,
      browser_url: body.browser_url != null ? String(body.browser_url) : undefined,
      user_id: body.user_id != null ? Number(body.user_id) : null,
    });
    json(res, 200, { success: true });
    return;
  }

  // ---- Share / replay ----
  if (pathname === "/api/v1/chat/share" && method === "POST") {
    json(res, 200, { token: randomUUID().slice(0, 16) });
    return;
  }
  if (pathname.includes("/chat/share/info/") && method === "GET") {
    json(res, 200, { success: false, error: "Share data unavailable" });
    return;
  }
  if (pathname.includes("/chat/share/playback/") && method === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end('data: {"error": "Share data unavailable"}\n\n');
    return;
  }
  if (pathname.includes("/chat/steps/playback/") && method === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end('data: {"error": "Replay data is unavailable for this task."}\n\n');
    return;
  }
  if (pathname === "/api/v1/chat/files/upload" && method === "POST") {
    json(res, 200, { success: true, file_id: `file_${randomUUID().slice(0, 12)}` });
    return;
  }

  // ---- Remote control (stub: page renders with no sessions) ----
  if (pathname.startsWith("/api/v1/remote-control/")) {
    if (method === "GET" && pathname.endsWith("/sessions")) {
      json(res, 200, { items: [], sessions: [] });
      return;
    }
    if (method === "POST" && pathname.endsWith("/sessions")) {
      json(res, 200, { session: { id: randomUUID(), status: "created" } });
      return;
    }
    json(res, 200, { success: true });
    return;
  }

  json(res, 404, { code: 1, text: `Not found: ${method} ${pathname}` });
}

function groupHistories(
  histories: Array<{
    project_id: string;
    space_id: string | null;
    project_name?: string;
    tokens?: number;
    status: number;
    created_at: number;
    question: string;
  }>,
  includeTasks: boolean,
): unknown[] {
  const map = new Map<
    string,
    {
      project_id: string;
      space_id: string | null;
      project_name: string;
      total_tokens: number;
      task_count: number;
      total_triggers: number;
      latest_task_date: string;
      tasks: unknown[];
      total_completed_tasks: number;
      total_ongoing_tasks: number;
      average_tokens_per_task: number;
      last_prompt: string;
    }
  >();
  for (const entry of histories) {
    const projectId = entry.project_id;
    let project = map.get(projectId);
    if (!project) {
      project = {
        project_id: projectId,
        space_id: entry.space_id,
        project_name: entry.project_name ?? `Project ${projectId}`,
        total_tokens: 0,
        task_count: 0,
        total_triggers: 0,
        latest_task_date: new Date(entry.created_at).toISOString(),
        tasks: [],
        total_completed_tasks: 0,
        total_ongoing_tasks: 0,
        average_tokens_per_task: 0,
        last_prompt: entry.question ?? "",
      };
      map.set(projectId, project);
    }
    project.total_tokens += entry.tokens ?? 0;
    project.task_count += 1;
    project.total_completed_tasks += entry.status === 2 ? 1 : 0;
    project.total_ongoing_tasks += entry.status === 1 ? 1 : 0;
    if (entry.created_at > new Date(project.latest_task_date).getTime()) {
      project.latest_task_date = new Date(entry.created_at).toISOString();
    }
    if (includeTasks) {
      project.tasks.push({ ...entry });
    }
  }
  for (const project of map.values()) {
    project.average_tokens_per_task =
      project.task_count > 0 ? Math.round(project.total_tokens / project.task_count) : 0;
    project.tasks.sort(
      (a, b) =>
        new Date((b as { created_at: number }).created_at).getTime() -
        new Date((a as { created_at: number }).created_at).getTime(),
    );
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.latest_task_date).getTime() - new Date(a.latest_task_date).getTime(),
  );
}
