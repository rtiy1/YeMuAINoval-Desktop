import type { Logger } from "pino";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

import type {
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
  AgentTimelineItem,
  AgentUsage,
} from "../engine/agent-sdk-types.js";
import { ProjectEngine, type WorkerSpec } from "./engine.js";
import type { WorkspaceBinding } from "./store.js";

export type SessionMode = "workforce" | "single-agent";

export interface SubTask {
  id: string;
  content: string;
  status: "" | "running" | "completed" | "failed" | "skipped" | "waiting";
  report?: string;
  failure_count?: number;
}

export interface ChatStartPayload {
  project_id: string;
  task_id: string;
  space_id?: string | null;
  run_id?: string | null;
  space_root_path?: string | null;
  question: string;
  email: string;
  user_id?: string | number | null;
  model_type?: string;
  model_platform?: string | null;
  api_key?: string;
  api_url?: string | null;
  session_mode?: SessionMode;
  new_agents?: Array<{ name: string; description?: string; tools?: string[] }>;
  workdir_mode?: string | null;
  attaches?: string[];
  project_context?: string | null;
  summary_prompt?: string;
  env_path?: string | null;
}

export interface Project {
  id: string;
  spaceId: string | null;
  email: string;
  userId: string | null;
  binding: WorkspaceBinding | null;
  sessionMode: SessionMode;
  engine: ProjectEngine;
  session: AgentSession | null;
  sessionId: string | null;
  status: "offline" | "running" | "done" | "confirming";
  currentTaskId: string | null;
  plan: SubTask[];
  todos: SubTask[];
  tokens: number;
  history: string[];
  /** true when the user confirmed the plan and execution started */
  executionStarted: boolean;
  /** Promise resolver used to gate execution on plan confirmation */
  waiters: Array<(confirmed: boolean) => void>;
}

interface ActiveTurn {
  taskId: string;
  startedAt: number;
  textBuffer: string;
  todos: SubTask[];
  completedTodoIds: Set<string>;
  toolCalls: Map<string, { name: string; startedAt: number }>;
  currentAgent: string;
}

export interface ProjectEngineOptions {
  logger: Logger;
  runtimeSettings?: import("../engine/provider-launch-config.js").ProviderRuntimeSettings;
}

const PLAN_SYSTEM_PROMPT = [
  "You are the coordinator of a multi-agent workforce.",
  "First analyze the user's request and produce a clear, step-by-step plan.",
  "List the plan steps one per line, prefixed with a number, e.g. `1. ...`.",
  "Do not modify any files during this planning phase; only research and plan.",
].join("\n");

const EXECUTION_SYSTEM_PROMPT = [
  "You are the lead developer agent of a multi-agent workforce.",
  "Execute the confirmed plan. Keep the user informed of progress.",
  "Finish with a concise summary of what was done.",
].join("\n");

export class ProjectManager {
  private readonly projects = new Map<string, Project>();

  constructor(
    private readonly options: ProjectEngineOptions,
    private readonly defaultWorkspaceRoot: string,
  ) {}

  hasProject(projectId: string): boolean {
    return this.projects.has(projectId);
  }

  getProject(projectId: string): Project | null {
    return this.projects.get(projectId) ?? null;
  }

  ensureProject(projectId: string, payload: ChatStartPayload): Project {
    const existing = this.projects.get(projectId);
    if (existing) {
      return existing;
    }
    const engine = new ProjectEngine({ logger: this.options.logger });
    const project: Project = {
      id: projectId,
      spaceId: payload.space_id ?? null,
      email: payload.email,
      userId: payload.user_id != null ? String(payload.user_id) : null,
      binding: null,
      sessionMode: payload.session_mode ?? "workforce",
      engine,
      session: null,
      sessionId: null,
      status: "offline",
      currentTaskId: null,
      plan: [],
      todos: [],
      tokens: 0,
      history: [],
      executionStarted: false,
      waiters: [],
    };
    for (const worker of payload.new_agents ?? []) {
      const spec: WorkerSpec = {
        name: worker.name,
        description: worker.description ?? "",
        tools: worker.tools ?? [],
      };
      engine.addWorker(spec);
    }
    this.projects.set(projectId, project);
    return project;
  }

  resolveWorkspaceRoot(project: Project): string {
    return project.binding?.workspace_root ?? this.defaultWorkspaceRoot;
  }

  bindProject(projectId: string, binding: WorkspaceBinding): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.binding = binding;
    }
  }

  private ensureWorkspace(project: Project): string {
    const root = this.resolveWorkspaceRoot(project);
    try {
      mkdirSync(root, { recursive: true });
    } catch (error) {
      this.options.logger.warn({ error, root }, "Failed to create workspace root");
    }
    return root;
  }

  async startTurn(projectId: string, payload: ChatStartPayload): Promise<void> {
    const project = this.ensureProject(projectId, payload);
    project.currentTaskId = payload.task_id;
    project.executionStarted = false;
    project.plan = [];
    project.todos = [];

    const session = await this.ensureSession(project, payload);

    // Emit confirmed, the UI uses it to seed the chat store.
    this.emit(project, "confirmed", { question: payload.question });

    const mode = project.sessionMode;
    if (mode === "workforce") {
      await this.runPlanningTurn(project, session, payload);
      return;
    }
    await this.runExecutionTurn(project, session, {
      prompt: buildSingleAgentPrompt(payload),
      taskId: payload.task_id,
    });
  }

  private async ensureSession(
    project: Project,
    payload: ChatStartPayload,
  ): Promise<AgentSession> {
    if (project.session) {
      return project.session;
    }
    const config: AgentSessionConfig = {
      provider: "mcode",
      cwd: this.ensureWorkspace(project),
      systemPrompt: undefined,
      modeId: "default",
    };
    const session = await project.engine.createSession(config, {
      env: buildMCodeEnv(payload),
    });
    project.session = session;
    project.sessionId = String(session.id);
    session.subscribe((event) => this.handleSessionEvent(project, event));
    return session;
  }

  private async runPlanningTurn(
    project: Project,
    session: AgentSession,
    payload: ChatStartPayload,
  ): Promise<void> {
    project.status = "running";
    const turn: ActiveTurn = {
      taskId: payload.task_id,
      startedAt: Date.now(),
      textBuffer: "",
      todos: [],
      completedTodoIds: new Set(),
      toolCalls: new Map(),
      currentAgent: "coordinator_agent",
    };
    this.activeTurns.set(project.id, turn);

    const prompt = [
      payload.project_context ? `${payload.project_context}\n\n` : "",
      `User request:\n${payload.question}`,
    ].join("");

    await session.run(
      [{ type: "text", text: `${prompt}\n\n${PLAN_SYSTEM_PROMPT}` }],
      { clientMessageId: randomUUID() },
    );

    // Planning turn finished: synthesize the plan.
    const subTasks = synthesizePlan(turn);
    project.plan = subTasks;
    project.status = "confirming";
    project.executionStarted = false;

    // Reset the active turn so execution runs as a fresh turn.
    this.activeTurns.delete(project.id);

    this.emit(project, "to_sub_tasks", {
      sub_tasks: subTasks,
      summary_task: payload.question.split("\n")[0]?.slice(0, 120) ?? "",
    });

    // Wait for the user to confirm the plan (PUT /task + POST /task/start).
    let cancelled = false;
    await new Promise<void>((resolve) => {
      project.waiters.push((confirmed) => {
        if (confirmed) {
          resolve();
        } else {
          cancelled = true;
          resolve();
        }
      });
    });

    if (cancelled || project.status !== ("running" as Project["status"])) {
      return;
    }
    await this.runExecutionTurn(project, session, {
      prompt: buildExecutionPrompt(project, payload),
      taskId: payload.task_id,
    });
  }

  async confirmPlan(projectId: string, tasks: SubTask[]): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      return;
    }
    project.plan = tasks.length > 0 ? tasks : project.plan;
    project.status = "running";
    project.executionStarted = true;
    for (const waiter of project.waiters.splice(0)) {
      waiter(true);
    }
  }

  private async runExecutionTurn(
    project: Project,
    session: AgentSession,
    options: { prompt: string; taskId: string },
  ): Promise<void> {
    project.status = "running";
    project.executionStarted = true;
    const turn: ActiveTurn = {
      taskId: options.taskId,
      startedAt: Date.now(),
      textBuffer: "",
      todos: project.sessionMode === "single-agent" ? [] : [...project.plan],
      completedTodoIds: new Set(),
      toolCalls: new Map(),
      currentAgent: "developer_agent",
    };
    this.activeTurns.set(project.id, turn);

    this.emit(project, "create_agent", {
      agent_name: "developer_agent",
      agent_id: "developer_agent",
      tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "TodoWrite"],
    });

    if (project.sessionMode === "single-agent" && turn.todos.length > 0) {
      this.emit(project, "todo_state", {
        agent_id: "single_agent",
        todos: turn.todos.map((todo) => ({
          id: todo.id,
          content: todo.content,
          status: "pending",
        })),
      });
    }

    await session.run(
      [{ type: "text", text: `${options.prompt}\n\n${EXECUTION_SYSTEM_PROMPT}` }],
      { clientMessageId: randomUUID() },
    );

    // Execution finished.
    const summary = turn.textBuffer.trim() || "Task finished";
    this.activeTurns.delete(project.id);
    this.emit(project, "end", {
      summary,
      message: summary,
      tokens: project.tokens,
    });
    project.status = "done";
    project.executionStarted = false;
  }

  private readonly activeTurns = new Map<string, ActiveTurn>();

  private handleSessionEvent(project: Project, event: AgentStreamEvent): void {
    const turn = this.activeTurns.get(project.id);
    switch (event.type) {
      case "usage_updated":
      case "turn_completed":
        if (event.usage) {
          this.accumulateUsage(project, event.usage);
        }
        break;
      case "timeline":
        this.handleTimeline(project, turn, event.item);
        break;
      default:
        break;
    }
  }

  private accumulateUsage(project: Project, usage: AgentUsage): void {
    const inputTokens = "inputTokens" in usage ? Number(usage.inputTokens) : 0;
    const outputTokens = "outputTokens" in usage ? Number(usage.outputTokens) : 0;
    project.tokens += Number.isFinite(inputTokens) ? inputTokens : 0;
    project.tokens += Number.isFinite(outputTokens) ? outputTokens : 0;
  }

  private handleTimeline(
    project: Project,
    turn: ActiveTurn | undefined,
    item: AgentTimelineItem,
  ): void {
    if (!turn) {
      return;
    }
    switch (item.type) {
      case "assistant_message":
        turn.textBuffer += item.text;
        if (project.sessionMode === "single-agent") {
          break;
        }
        this.emit(project, "decompose_text", { content: item.text });
        break;
      case "todo":
        this.handleTodoUpdate(project, turn, item.items);
        break;
      case "tool_call":
        if (item.status === "running") {
          this.emit(project, "activate_agent", {
            agent_id: "developer_agent",
            process_task_id: turn.todos.find((todo) => todo.status === "running")?.id,
            state: "running",
          });
        } else {
          this.emit(project, "deactivate_agent", {
            agent_id: "developer_agent",
            process_task_id: turn.todos.find((todo) => todo.status === "running")?.id,
            state: "completed",
          });
        }
        break;
      default:
        break;
    }
  }

  private handleTodoUpdate(
    project: Project,
    turn: ActiveTurn,
    items: Array<{ text: string; completed: boolean }>,
  ): void {
    for (const item of items) {
      const existing = turn.todos.find((todo) => todo.content === item.text);
      if (existing) {
        existing.status = item.completed ? "completed" : "running";
        if (item.completed) {
          turn.completedTodoIds.add(existing.id);
          this.emit(project, "task_state", {
            task_id: existing.id,
            state: "DONE",
            result: "",
            failure_count: 0,
          });
        } else {
          this.emit(project, "task_state", {
            task_id: existing.id,
            state: "RUNNING",
            result: "",
            failure_count: 0,
          });
        }
      } else if (!item.completed) {
        const todo: SubTask = {
          id: `todo_${turn.todos.length + 1}`,
          content: item.text,
          status: "running",
        };
        turn.todos.push(todo);
        if (project.sessionMode === "single-agent") {
          this.emit(project, "todo_state", {
            agent_id: "single_agent",
            todos: turn.todos.map((entry) => ({
              id: entry.id,
              content: entry.content,
              status: "in_progress",
            })),
          });
        } else {
          this.emit(project, "assign_task", {
            assignee_id: "developer_agent",
            task_id: todo.id,
            content: todo.content,
            state: "running",
          });
        }
      }
    }
    project.plan = turn.todos;
  }

  async skipTask(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      return;
    }
    this.emit(project, "end", {
      summary: "<summary>Task stopped</summary>",
      tokens: project.tokens,
    });
    project.status = "done";
    await project.engine.closeAll();
  }

  async stopAll(): Promise<void> {
    for (const projectId of this.projects.keys()) {
      await this.stopProject(projectId);
    }
  }

  async updatePlan(projectId: string, tasks: SubTask[]): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      return;
    }
    project.plan = tasks;
  }

  async stopProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      return;
    }
    await project.session?.interrupt();
    await project.engine.closeAll();
    project.status = "offline";
    for (const waiter of project.waiters.splice(0)) {
      waiter(false);
    }
  }

  async interrupt(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      return;
    }
    await project.session?.interrupt();
  }

  async addTask(
    projectId: string,
    content: string,
  ): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      return;
    }
    const task: SubTask = {
      id: `task_${randomUUID().slice(0, 8)}`,
      content,
      status: "waiting",
    };
    project.plan.push(task);
    this.emit(project, "add_task", { task });
  }

  async removeTask(projectId: string, taskId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      return;
    }
    project.plan = project.plan.filter((task) => task.id !== taskId);
    this.emit(project, "remove_task", { task_id: taskId });
  }

  async addAgent(projectId: string, worker: WorkerSpec): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      return;
    }
    project.engine.addWorker(worker);
    this.emit(project, "create_agent", {
      agent_name: "new_worker_agent",
      agent_id: `new_worker_${worker.name}`,
      tools: worker.tools,
    });
  }

  getStatus(projectId: string): {
    project_id: string;
    has_lock: boolean;
    status: string;
    current_task_id: string | null;
  } {
    const project = this.projects.get(projectId);
    if (!project) {
      return {
        project_id: projectId,
        has_lock: false,
        status: "offline",
        current_task_id: null,
      };
    }
    return {
      project_id: projectId,
      has_lock: true,
      status: project.status,
      current_task_id: project.currentTaskId,
    };
  }

  emit(project: Project, step: string, data: unknown): void {
    project.engine.emit(step, data);
  }
}

function synthesizePlan(turn: ActiveTurn): SubTask[] {
  if (turn.todos.length > 0) {
    return turn.todos.map((todo, index) => ({
      ...todo,
      id: todo.id || `task_${index + 1}`,
      status: "waiting",
    }));
  }
  const lines = turn.textBuffer
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const numbered = lines.filter(
    (line) => /^\d+[.)]/.test(line) || /^[-*] /.test(line),
  );
  if (numbered.length > 0) {
    return numbered.map((line, index) => ({
      id: `task_${index + 1}`,
      content: line.replace(/^\d+[.)]\s*/, "").replace(/^[-*]\s*/, ""),
      status: "waiting",
    }));
  }
  return [
    {
      id: "task_1",
      content: lines[0] || "Execute the request",
      status: "waiting",
    },
  ];
}

function buildSingleAgentPrompt(payload: ChatStartPayload): string {
  return [
    payload.project_context ? `${payload.project_context}\n\n` : "",
    `User request:\n${payload.question}`,
  ].join("");
}

function buildExecutionPrompt(project: Project, payload: ChatStartPayload): string {
  const plan = project.plan.map((task, index) => `${index + 1}. ${task.content}`).join("\n");
  return [
    payload.project_context ? `${payload.project_context}\n\n` : "",
    `Confirmed plan:\n${plan}\n\n`,
    `User request:\n${payload.question}`,
  ].join("");
}

function buildMCodeEnv(payload: ChatStartPayload): Record<string, string> {
  const env: Record<string, string> = {
    // Local-first: disable telemetry and nonessential traffic so the
    // GrowthBook version gate and auto-updater never phone home or block
    // the restored mcode runtime.
    DISABLE_TELEMETRY: "1",
    MCODE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };
  if (payload.api_key) {
    env.ANTHROPIC_API_KEY = payload.api_key;
  }
  if (payload.api_url) {
    env.ANTHROPIC_BASE_URL = payload.api_url;
  }
  return env;
}
