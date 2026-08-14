/**
 * REST API 客户端 — 封装所有后端 HTTP 调用。
 */

import axios, { type AxiosInstance } from 'axios';

import type {
  Chapter,
  ChapterListItem,
  Character,
  Project,
  Settings,
  Volume,
  WorldInfoEntry,
  AgentSession,
  SkillInfo,
  CommandInfo,
  StoredMessage,
  SessionUsage,
} from './types';

const baseURL = import.meta.env.VITE_API_BASE ?? '/api';

export const api: AxiosInstance = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

// ---- Projects ----

export const projectsApi = {
  list: () => api.get<{ data: Project[] }>('/projects').then((r) => r.data.data),
  get: (id: string) => api.get<{ data: Project }>(`/projects/${id}`).then((r) => r.data.data),
  create: (title: string, description?: string) =>
    api.post<{ data: Project }>('/projects', { title, description }).then((r) => r.data.data),
  update: (id: string, patch: Partial<Pick<Project, 'title' | 'description'>>) =>
    api.put<{ data: Project }>(`/projects/${id}`, patch).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/projects/${id}`),
};

// ---- Volumes ----

export const volumesApi = {
  list: (projectId: string) =>
    api.get<{ data: Volume[] }>(`/projects/${projectId}/volumes`).then((r) => r.data.data),
  create: (projectId: string, title: string) =>
    api
      .post<{ data: Volume }>(`/projects/${projectId}/volumes`, { title })
      .then((r) => r.data.data),
  update: (id: string, patch: Partial<Pick<Volume, 'title' | 'sortOrder'>>) =>
    api.put<{ data: Volume }>(`/volumes/${id}`, patch).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/volumes/${id}`),
};

// ---- Chapters ----

export const chaptersApi = {
  list: (volumeId: string) =>
    api
      .get<{ data: ChapterListItem[] }>(`/volumes/${volumeId}/chapters`)
      .then((r) => r.data.data),
  get: (id: string) => api.get<{ data: Chapter }>(`/chapters/${id}`).then((r) => r.data.data),
  create: (volumeId: string, title: string) =>
    api
      .post<{ data: Chapter }>(`/volumes/${volumeId}/chapters`, { title })
      .then((r) => r.data.data),
  update: (id: string, patch: { title?: string; content?: string; sortOrder?: number }) =>
    api.put<{ data: Chapter }>(`/chapters/${id}`, patch).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/chapters/${id}`),
};

// ---- Characters ----

export const charactersApi = {
  list: (projectId: string) =>
    api
      .get<{ data: Character[] }>(`/projects/${projectId}/characters`)
      .then((r) => r.data.data),
  create: (
    projectId: string,
    data: Partial<Pick<Character, 'name' | 'role' | 'profile' | 'appearance' | 'personality' | 'backstory'>>,
  ) =>
    api
      .post<{ data: Character }>(`/projects/${projectId}/characters`, data)
      .then((r) => r.data.data),
  update: (id: string, patch: Record<string, unknown>) =>
    api.put<{ data: Character }>(`/characters/${id}`, patch).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/characters/${id}`),
};

// ---- World Info ----

export const worldInfoApi = {
  list: (projectId: string) =>
    api
      .get<{ data: WorldInfoEntry[] }>(`/projects/${projectId}/world-info`)
      .then((r) => r.data.data),
  create: (
    projectId: string,
    data: Partial<Pick<WorldInfoEntry, 'title' | 'category' | 'content'>>,
  ) =>
    api
      .post<{ data: WorldInfoEntry }>(`/projects/${projectId}/world-info`, data)
      .then((r) => r.data.data),
  update: (id: string, patch: Record<string, unknown>) =>
    api.put<{ data: WorldInfoEntry }>(`/world-info/${id}`, patch).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/world-info/${id}`),
};

// ---- Agent Sessions ----

export const sessionsApi = {
  list: (projectId: string) =>
    api
      .get<{ data: AgentSession[] }>(`/projects/${projectId}/sessions`)
      .then((r) => r.data.data),
  create: (projectId: string, title?: string) =>
    api
      .post<{ data: AgentSession }>(`/projects/${projectId}/sessions`, { title })
      .then((r) => r.data.data),
  update: (id: string, title: string) =>
    api.put<{ data: AgentSession }>(`/sessions/${id}`, { title }).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/sessions/${id}`),
};

// ---- Settings ----

export const settingsApi = {
  get: () => api.get<{ data: Settings }>('/settings').then((r) => r.data.data),
  update: (settings: Settings) =>
    api.put<{ data: Settings }>('/settings', settings).then((r) => r.data.data),
};

// ---- Providers & Models ----

export interface ProviderInfo {
  id: string;
  label: string;
  description: string;
  needsBaseUrl: boolean;
  needsApiKey: boolean;
}

export interface ModelInfo {
  id: string;
  label: string;
  description?: string;
  contextWindow?: number;
}

export const providersApi = {
  list: () => api.get<{ data: ProviderInfo[] }>('/providers').then((r) => r.data.data),
};

/** 从供应商真实 API 获取模型列表（providerId 不传时使用当前启用的供应商）。 */
export const providerModelsApi = {
  fetch: (providerId?: string) =>
    api
      .post<{ data: { models: ModelInfo[]; error?: string; providerName?: string } }>(
        '/provider-models/fetch',
        providerId ? { providerId } : {},
      )
      .then((r) => r.data.data),
};

// ---- Provider 配置（多供应商管理） ----

export interface ProviderConfig {
  id: string;
  name: string;
  kind: string;
  apiKey?: string;
  baseUrl?: string;
  /** 该供应商使用的模型（模型 ID，可自定义填写）。 */
  model?: string;
  enabled: boolean;
  createdAt?: string;
}

export interface ProviderConfigsResponse {
  configs: ProviderConfig[];
  activeProvider?: string;
}

export const providerConfigsApi = {
  list: () =>
    api.get<{ data: ProviderConfigsResponse }>('/provider-configs').then((r) => r.data.data),
  create: (body: {
    name?: string;
    kind: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    enabled?: boolean;
  }) =>
    api.post<{ data: ProviderConfig }>('/provider-configs', body).then((r) => r.data.data),
  update: (
    id: string,
    body: {
      name?: string;
      kind?: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      enabled?: boolean;
    },
  ) => api.put<{ data: ProviderConfig }>(`/provider-configs/${id}`, body).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/provider-configs/${id}`),
  enable: (id: string) =>
    api.post<{ data: { activeProvider: string } }>(`/provider-configs/${id}/enable`).then((r) => r.data.data),
  disable: (id: string) =>
    api.post<{ data: { activeProvider: string } }>(`/provider-configs/${id}/disable`).then((r) => r.data.data),
};

// ---- Skills ----

export const skillsApi = {
  list: () => api.get<{ data: SkillInfo[] }>('/skills').then((r) => r.data.data),
  getEnabled: () =>
    api.get<{ data: string[] }>('/skills/enabled').then((r) => r.data.data),
  setEnabled: (skills: string[]) =>
    api.put<{ data: string[] }>('/skills/enabled', { skills }).then((r) => r.data.data),
};

// ---- Commands ----

export const commandsApi = {
  list: () => api.get<{ data: CommandInfo[] }>('/commands').then((r) => r.data.data),
};

// ---- Messages ----

export const messagesApi = {
  list: (sessionId: string) =>
    api.get<{ data: StoredMessage[] }>(`/sessions/${sessionId}/messages`).then((r) => r.data.data),
};

// ---- Usage ----

export const usageApi = {
  session: (sessionId: string) =>
    api.get<{ data: SessionUsage }>(`/sessions/${sessionId}/usage`).then((r) => r.data.data),
};
