/**
 * 模型供应商目录 — 定义所有支持的 LLM provider 及其环境变量映射。
 *
 * MCode 通过环境变量控制 provider：
 * - Anthropic 直连：ANTHROPIC_API_KEY
 * - 兼容 API（OpenAI/第三方）：ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL
 * - AWS Bedrock：CLAUDE_CODE_USE_BEDROCK=1
 * - Google Vertex：CLAUDE_CODE_USE_VERTEX=1
 * - Foundry：CLAUDE_CODE_USE_FOUNDRY=1
 *
 * 模型别名：sonnet / opus / haiku / best
 * 模型全名：claude-sonnet-4-20250514 / claude-opus-4-20250514 等
 */

export interface ProviderDefinition {
  id: string;
  label: string;
  description: string;
  /** 是否需要 Base URL 输入。 */
  needsBaseUrl: boolean;
  /** 是否需要 API Key 输入。 */
  needsApiKey: boolean;
  /** 额外的环境变量键值（固定值）。 */
  extraEnv?: Record<string, string>;
}

export interface ProviderModel {
  id: string;
  label: string;
  description?: string;
  /** 上下文窗口大小（tokens）。 */
  contextWindow?: number;
}

/**
 * 用户自定义的供应商配置（可添加多个，启用其中一个作为当前使用）。
 * 存储在 settings 表的 provider_configs key 下（JSON 数组）。
 */
export interface ProviderConfig {
  id: string;
  /** 显示名称。 */
  name: string;
  /** 供应商类型，对应 PROVIDERS 目录中的 id。 */
  kind: string;
  /** API Key（可空：Bedrock/Vertex/Foundry 走本机凭据）。 */
  apiKey?: string;
  /** Base URL（仅兼容 API 类供应商需要）。 */
  baseUrl?: string;
  /** 该供应商使用的模型（模型 ID，可自定义填写）。 */
  model?: string;
  /** 是否启用（停用后不出现在选择列表中）。 */
  enabled: boolean;
  createdAt?: string;
}

/** 解析 settings 中的 provider_configs JSON，非法/缺失时返回空数组。 */
export function parseProviderConfigs(raw?: string): ProviderConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is ProviderConfig =>
        !!c && typeof c === 'object' && typeof (c as ProviderConfig).id === 'string',
    );
  } catch {
    return [];
  }
}

/** 支持的供应商列表。 */
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Anthropic 官方 API（直连）',
    needsBaseUrl: false,
    needsApiKey: true,
  },
  {
    id: 'openai-compatible',
    label: '兼容 API（OpenAI / 第三方）',
    description: '任何兼容 OpenAI / Anthropic 格式的 API 端点',
    needsBaseUrl: true,
    needsApiKey: true,
  },
  {
    id: 'bedrock',
    label: 'AWS Bedrock',
    description: '通过 AWS Bedrock 调用 Claude',
    needsBaseUrl: false,
    needsApiKey: false,
    extraEnv: { CLAUDE_CODE_USE_BEDROCK: '1' },
  },
  {
    id: 'vertex',
    label: 'Google Vertex AI',
    description: '通过 Google Vertex AI 调用 Claude',
    needsBaseUrl: false,
    needsApiKey: false,
    extraEnv: { CLAUDE_CODE_USE_VERTEX: '1' },
  },
  {
    id: 'foundry',
    label: 'Azure Foundry',
    description: '通过 Azure AI Foundry 调用 Claude',
    needsBaseUrl: false,
    needsApiKey: false,
    extraEnv: { CLAUDE_CODE_USE_FOUNDRY: '1' },
  },
];

/**
 * 根据 settings 中的 provider 配置，组装 MCode 子进程环境变量。
 *
 * 优先使用多供应商配置（provider_configs + active_provider）；
 * 若不存在则回退到旧版扁平字段（provider / api_key / base_url），保证向后兼容。
 */
export function buildProviderEnv(
  settings: Record<string, string>,
  configs?: ProviderConfig[],
): Record<string, string> {
  const env: Record<string, string> = {};

  // ---- 新版：多供应商配置 ----
  const list = configs ?? parseProviderConfigs(settings.provider_configs);
  const activeId = settings.active_provider;
  const active = list.find((c) => c.id === activeId && c.enabled);

  let kind: string | undefined;
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  let model: string | undefined;

  if (active) {
    kind = active.kind;
    apiKey = active.apiKey;
    baseUrl = active.baseUrl;
    model = active.model;
  } else {
    // ---- 旧版回退：扁平 provider / api_key / base_url ----
    kind = settings.provider || 'anthropic';
    apiKey = settings.api_key;
    baseUrl = settings.base_url;
  }

  const provider = PROVIDERS.find((p) => p.id === kind);
  if (!provider) return env;

  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;

  if (baseUrl && provider.needsBaseUrl) {
    env.ANTHROPIC_BASE_URL = baseUrl;
  }

  if (provider.extraEnv) {
    Object.assign(env, provider.extraEnv);
  }

  // 模型：优先当前供应商配置的模型，回退全局 model_name（兼容旧数据）
  const resolvedModel = model ?? settings.model_name;
  if (resolvedModel) {
    env.ANTHROPIC_MODEL = resolvedModel;
  }

  return env;
}

/**
 * 从供应商的真实 API 获取可用模型列表。
 *
 * - anthropic：GET {baseUrl}/v1/models（x-api-key 认证）
 * - openai-compatible：GET {baseUrl}/models（Bearer 认证，404 时回退 /v1/models）
 * - bedrock / vertex / foundry：无标准 HTTP 模型列表接口，返回提示
 */
export async function fetchProviderModels(
  config: ProviderConfig,
): Promise<{ models: ProviderModel[]; error?: string }> {
  try {
    if (config.kind === 'anthropic') {
      const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
      if (!config.apiKey) return { models: [], error: '该供应商缺少 API Key' };
      const res = await fetch(`${base}/v1/models`, {
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!res.ok) return { models: [], error: `Anthropic 接口返回 ${res.status}` };
      const json = (await res.json()) as {
        data?: Array<{ id: string; display_name?: string; created_at?: string }>;
      };
      const models = (json.data ?? []).map((m) => ({
        id: m.id,
        label: m.display_name ?? m.id,
        description: m.created_at ? `发布于 ${m.created_at.slice(0, 10)}` : undefined,
      }));
      if (models.length === 0) return { models: [], error: '接口未返回模型列表' };
      return { models };
    }

    if (config.kind === 'openai-compatible') {
      const base = (config.baseUrl || '').replace(/\/+$/, '');
      if (!base) return { models: [], error: '该供应商缺少 Base URL' };
      const headers: Record<string, string> = {};
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

      // 先试 {base}/models，404 时回退 {base}/v1/models
      let res = await fetch(`${base}/models`, { headers });
      if (res.status === 404) {
        res = await fetch(`${base}/v1/models`, { headers });
      }
      if (!res.ok) return { models: [], error: `模型接口返回 ${res.status}` };
      const json = (await res.json()) as {
        data?: Array<{ id: string; owned_by?: string }>;
      };
      const models = (json.data ?? []).map((m) => ({
        id: m.id,
        label: m.owned_by && m.owned_by !== 'system' ? `${m.id}（${m.owned_by}）` : m.id,
      }));
      if (models.length === 0) return { models: [], error: '接口未返回模型列表' };
      return { models };
    }

    return {
      models: [],
      error: '该供应商类型暂不支持自动获取模型，请手动填写模型 ID',
    };
  } catch (err) {
    return { models: [], error: `获取模型失败: ${(err as Error).message}` };
  }
}
