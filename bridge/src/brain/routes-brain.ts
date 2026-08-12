import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

import { bridgeStore, scratchSpaceRoot, type WorkspaceBinding } from "./store.js";
import type { ProjectManager, ChatStartPayload, SubTask } from "./project-manager.js";
import { openSse } from "./sse.js";

const FILES_ROOT = join(homedir(), ".yemu", "bridge", "files");

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

function parseChatPayload(body: Record<string, unknown>): ChatStartPayload {
  const taskId = String(body.task_id ?? randomUUID());
  return {
    project_id: String(body.project_id ?? taskId),
    task_id: taskId,
    space_id: body.space_id != null ? String(body.space_id) : null,
    run_id: body.run_id != null ? String(body.run_id) : null,
    space_root_path: body.space_root_path != null ? String(body.space_root_path) : null,
    question: String(body.question ?? ""),
    email: String(body.email ?? "local@yemu.local"),
    user_id: body.user_id != null ? String(body.user_id) : null,
    model_type: body.model_type != null ? String(body.model_type) : undefined,
    model_platform: body.model_platform != null ? String(body.model_platform) : undefined,
    api_key: body.api_key != null ? String(body.api_key) : undefined,
    api_url: body.api_url != null ? String(body.api_url) : undefined,
    session_mode:
      body.session_mode === "single-agent" ? "single-agent" : "workforce",
    new_agents: Array.isArray(body.new_agents)
      ? (body.new_agents as Array<{
          name: string;
          description?: string;
          tools?: string[];
        }>)
      : undefined,
    workdir_mode: body.workdir_mode != null ? String(body.workdir_mode) : undefined,
    attaches: Array.isArray(body.attaches)
      ? body.attaches.map(String)
      : undefined,
    project_context: body.project_context != null ? String(body.project_context) : null,
    env_path: body.env_path != null ? String(body.env_path) : null,
  };
}

export async function handleBrainRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
  projects: ProjectManager,
): Promise<void> {
  const method = req.method ?? "GET";

  // ---- Workspace ----
  if (pathname === "/workspace/capabilities" && method === "GET") {
    json(res, 200, {
      binding_enabled: true,
      scratch_enabled: true,
      overlay_sync: false,
      manifest: {},
    });
    return;
  }
  if (pathname === "/workspace/diagnostics" && method === "GET") {
    json(res, 200, { overlay_sync_failures: 0 });
    return;
  }
  if (pathname === "/workspace/current" && method === "GET") {
    const spaceId = String(url.searchParams.get("space_id") ?? "");
    const email = String(url.searchParams.get("email") ?? "local@yemu.local");
    const userId = url.searchParams.get("user_id");
    const binding = bridgeStore.getBinding(email, spaceId, userId);
    const workspaceRoot = binding?.workspace_root;
    json(res, 200, {
      space_id: spaceId,
      email,
      user_id: userId,
      bound: Boolean(binding && workspaceRoot && existsSync(workspaceRoot)),
      workspace_root: workspaceRoot ?? null,
      binding: binding ?? null,
    });
    return;
  }
  if (pathname === "/workspace/scratch" && method === "POST") {
    const body = await readJsonBody(req);
    const email = String(body.email ?? "local@yemu.local");
    const spaceId = String(body.space_id ?? "");
    const userId = body.user_id != null ? String(body.user_id) : null;
    let binding = bridgeStore.getBinding(email, spaceId, userId);
    if (!binding) {
      const root = scratchSpaceRoot(email, spaceId, userId);
      mkdirSync(root, { recursive: true });
      binding = {
        space_id: spaceId,
        email,
        user_id: userId,
        workspace_root: root,
      };
      bridgeStore.setBinding(binding);
    } else {
      mkdirSync(binding.workspace_root, { recursive: true });
    }
    json(res, 200, {
      space_id: spaceId,
      email,
      user_id: userId,
      bound: true,
      workspace_root: binding.workspace_root,
      binding: { ...binding },
    });
    return;
  }
  if (pathname === "/workspace/bind" && method === "POST") {
    const body = await readJsonBody(req);
    const email = String(body.email ?? "local@yemu.local");
    const spaceId = String(body.space_id ?? "");
    const userId = body.user_id != null ? String(body.user_id) : null;
    const root = String(body.path ?? body.workspace_root ?? "");
    if (!root) {
      json(res, 400, { code: 1, text: "Missing path" });
      return;
    }
    const binding: WorkspaceBinding = {
      space_id: spaceId,
      email,
      user_id: userId,
      workspace_root: root,
    };
    bridgeStore.setBinding(binding);
    json(res, 200, {
      space_id: spaceId,
      email,
      user_id: userId,
      bound: true,
      workspace_root: root,
      binding: { ...binding },
    });
    return;
  }
  if (pathname.startsWith("/workspace/") && method === "DELETE") {
    const spaceId = decodeURIComponent(pathname.slice("/workspace/".length));
    bridgeStore.removeBinding(spaceId);
    json(res, 200, { success: true });
    return;
  }
  if (pathname === "/workspace/reconcile" && method === "POST") {
    json(res, 200, { success: true });
    return;
  }

  // ---- Chat ----
  if (pathname === "/chat" && method === "POST") {
    const body = await readJsonBody(req);
    const payload = parseChatPayload(body);
    const projectId = payload.project_id;
    const project = projects.ensureProject(projectId, payload);
    const client = openSse(res);
    project.engine.attachClient(client);
    projects.startTurn(projectId, payload).catch((error) => {
      project.engine.emit("error", { message: String(error?.message ?? error) });
      project.engine.emit("end", { message: String(error?.message ?? error) });
    });
    return;
  }
  const chatImproveMatch = pathname.match(/^\/chat\/([^/]+)$/);
  if (chatImproveMatch && method === "POST") {
    const projectId = decodeURIComponent(chatImproveMatch[1]);
    const body = await readJsonBody(req);
    const project = projects.getProject(projectId);
    if (!project) {
      json(res, 404, { code: 1, text: "Project not found" });
      return;
    }
    const payload = parseChatPayload({
      ...body,
      project_id: projectId,
      email: project.email,
      user_id: project.userId,
      space_id: project.spaceId,
    });
    projects.startTurn(projectId, payload).catch((error) => {
      project.engine.emit("error", { message: String(error?.message ?? error) });
    });
    res.writeHead(201);
    res.end();
    return;
  }
  if (chatImproveMatch && method === "DELETE") {
    const projectId = decodeURIComponent(chatImproveMatch[1]);
    await projects.stopProject(projectId);
    res.writeHead(204);
    res.end();
    return;
  }
  if (chatImproveMatch && method === "GET" && pathname.endsWith("/status")) {
    const projectId = decodeURIComponent(chatImproveMatch[1]);
    json(res, 200, projects.getStatus(projectId));
    return;
  }
  const statusMatch = pathname.match(/^\/chat\/([^/]+)\/status$/);
  if (statusMatch && method === "GET") {
    const projectId = decodeURIComponent(statusMatch[1]);
    json(res, 200, projects.getStatus(projectId));
    return;
  }
  const humanReplyMatch = pathname.match(/^\/chat\/([^/]+)\/human-reply$/);
  if (humanReplyMatch && method === "POST") {
    const projectId = decodeURIComponent(humanReplyMatch[1]);
    const body = await readJsonBody(req);
    const project = projects.getProject(projectId);
    if (!project) {
      json(res, 400, { code: 1, text: "This task is no longer waiting for a human reply" });
      return;
    }
    const reply = String(body.reply ?? "");
    const allow = reply.trim() !== "" && !/^(no|deny|cancel|reject|否|拒绝)/i.test(reply.trim());
    const requestId = project.engine.getPendingPermissionRequestId();
    if (requestId && project.session) {
      await project.engine.respondToPermission(project.session, requestId, {
        allow,
        message: reply,
      });
    } else {
      // No pending permission: treat the reply as a follow-up prompt.
      await projects.startTurn(projectId, {
        ...chatPayloadFromProject(project),
        question: reply,
        task_id: randomUUID(),
      });
    }
    res.writeHead(201);
    res.end();
    return;
  }
  const addTaskMatch = pathname.match(/^\/chat\/([^/]+)\/add-task$/);
  if (addTaskMatch && method === "POST") {
    const projectId = decodeURIComponent(addTaskMatch[1]);
    const body = await readJsonBody(req);
    await projects.addTask(projectId, String(body.content ?? ""));
    res.writeHead(201);
    res.end();
    return;
  }
  const removeTaskMatch = pathname.match(/^\/chat\/([^/]+)\/remove-task\/([^/]+)$/);
  if (removeTaskMatch && method === "DELETE") {
    const projectId = decodeURIComponent(removeTaskMatch[1]);
    const taskId = decodeURIComponent(removeTaskMatch[2]);
    await projects.removeTask(projectId, taskId);
    res.writeHead(204);
    res.end();
    return;
  }
  const skipTaskMatch = pathname.match(/^\/chat\/([^/]+)\/skip-task$/);
  if (skipTaskMatch && method === "POST") {
    const projectId = decodeURIComponent(skipTaskMatch[1]);
    await projects.skipTask(projectId);
    res.writeHead(201);
    res.end();
    return;
  }
  const installMcpMatch = pathname.match(/^\/chat\/([^/]+)\/install-mcp$/);
  if (installMcpMatch && method === "POST") {
    res.writeHead(201);
    res.end();
    return;
  }

  // ---- Task ----
  if (pathname === "/task/stop-all" && method === "DELETE") {
    await projects.stopAll();
    res.writeHead(204);
    res.end();
    return;
  }
  const taskStartMatch = pathname.match(/^\/task\/([^/]+)\/start$/);
  if (taskStartMatch && method === "POST") {
    const projectId = decodeURIComponent(taskStartMatch[1]);
    await projects.confirmPlan(projectId, []);
    res.writeHead(201);
    res.end();
    return;
  }
  const taskPutMatch = pathname.match(/^\/task\/([^/]+)$/);
  if (taskPutMatch && method === "PUT") {
    const projectId = decodeURIComponent(taskPutMatch[1]);
    const body = await readJsonBody(req);
    const tasks: SubTask[] = Array.isArray(body.task)
      ? (body.task as Array<{ id?: string; content?: string }>).map(
          (task, index) => ({
            id: task.id ?? `task_${index + 1}`,
            content: String(task.content ?? ""),
            status: "waiting",
          }),
        )
      : [];
    await projects.updatePlan(projectId, tasks);
    res.writeHead(201);
    res.end();
    return;
  }
  const takeControlMatch = pathname.match(/^\/task\/([^/]+)\/take-control$/);
  if (takeControlMatch && method === "PUT") {
    const projectId = decodeURIComponent(takeControlMatch[1]);
    const body = await readJsonBody(req);
    const action = String(body.action ?? "");
    if (action === "stop") {
      await projects.interrupt(projectId);
      await projects.skipTask(projectId);
    } else if (action === "pause") {
      await projects.interrupt(projectId);
    }
    res.writeHead(204);
    res.end();
    return;
  }
  const addAgentMatch = pathname.match(/^\/task\/([^/]+)\/add-agent$/);
  if (addAgentMatch && method === "POST") {
    const projectId = decodeURIComponent(addAgentMatch[1]);
    const body = await readJsonBody(req);
    await projects.addAgent(projectId, {
      name: String(body.name ?? "New Agent"),
      description: body.description != null ? String(body.description) : "",
      tools: Array.isArray(body.tools) ? body.tools.map(String) : [],
    });
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- Model ----
  if (pathname === "/model/validate" && method === "POST") {
    const body = await readJsonBody(req);
    const modelType = String(body.model_type ?? "claude-sonnet-4-5");
    json(res, 200, {
      success: true,
      model_type: modelType,
      capabilities: ["text"],
    });
    return;
  }

  // ---- MCP ----
  if (pathname === "/mcp/list" && method === "GET") {
    json(res, 200, { mcpServers: {} });
    return;
  }
  if (pathname === "/mcp/install" && method === "POST") {
    json(res, 200, { success: true });
    return;
  }
  const mcpMatch = pathname.match(/^\/mcp\/([^/]+)$/);
  if (mcpMatch && (method === "DELETE" || method === "PUT")) {
    json(res, 200, { success: true });
    return;
  }

  // ---- Skills ----
  if (pathname === "/skills" && method === "GET") {
    json(res, 200, { success: true, skills: [] });
    return;
  }
  if (pathname === "/skills/import" && method === "POST") {
    json(res, 200, { success: true });
    return;
  }
  if (pathname.startsWith("/skills/") && method === "GET") {
    json(res, 200, { success: true, content: "", files: [], path: "" });
    return;
  }
  if (pathname.startsWith("/skills/") && method === "DELETE") {
    json(res, 200, { success: true });
    return;
  }
  if (pathname.startsWith("/skills/") && method === "PUT") {
    json(res, 200, { success: true });
    return;
  }

  // ---- Files ----
  if (pathname === "/files" && method === "GET") {
    json(res, 200, []);
    return;
  }
  if (pathname === "/files" && method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);
    const contentDisposition = String(req.headers["content-disposition"] ?? "");
    const nameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    const filename = nameMatch ? nameMatch[1] : `upload_${randomUUID().slice(0, 8)}.bin`;
    mkdirSync(FILES_ROOT, { recursive: true });
    const fileId = `file_${randomUUID().slice(0, 12)}`;
    const filePath = join(FILES_ROOT, `${fileId}_${basename(filename)}`);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(filePath, body);
    json(res, 200, { file_id: fileId, filename, size: body.length });
    return;
  }

  // ---- Tools (integrations) ----
  if (pathname.startsWith("/install/tool/") && method === "POST") {
    json(res, 200, { success: true });
    return;
  }
  if (pathname.startsWith("/uninstall/tool/") && method === "DELETE") {
    json(res, 200, { success: true });
    return;
  }
  if (pathname === "/linkedin/save-token" && method === "POST") {
    json(res, 200, { success: true });
    return;
  }

  // ---- Browser stubs ----
  if (pathname.startsWith("/browser/") || pathname === "/browser") {
    json(res, 200, {
      success: true,
      browsers: [],
      cookies: [],
      status: "not_available",
    });
    return;
  }

  // ---- Remote sub-agent ----
  if (pathname === "/remote-sub-agent/validate" && method === "POST") {
    json(res, 200, { success: true });
    return;
  }

  json(res, 404, { code: 1, text: `Not found: ${method} ${pathname}` });
}

function chatPayloadFromProject(project: NonNullable<ReturnType<ProjectManager["getProject"]>>): ChatStartPayload {
  return {
    project_id: project.id,
    task_id: project.currentTaskId ?? randomUUID(),
    space_id: project.spaceId,
    email: project.email,
    user_id: project.userId,
    question: "",
    session_mode: project.sessionMode,
  };
}
