/**
 * Provider 配置路由 — 多供应商管理（增删改查 + 启用/停用）。
 *
 * 数据存储在 settings 表的两个 key 下：
 * - provider_configs：JSON 数组（ProviderConfig[]）
 * - active_provider：当前启用的 provider id
 *
 * 首次读取时自动迁移旧版扁平配置（provider / api_key / base_url → ProviderConfig）。
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { getDb, schema } from '../db/index.js';
import {
  PROVIDERS,
  parseProviderConfigs,
  type ProviderConfig,
} from '../mcode/providers.js';

/** 读取单个 settings key。 */
async function getSetting(db: ReturnType<typeof getDb>, key: string): Promise<string | undefined> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value;
}

/** 写入单个 settings key（upsert）。 */
async function setSetting(
  db: ReturnType<typeof getDb>,
  key: string,
  value: string,
): Promise<void> {
  const [existing] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  if (existing) {
    await db
      .update(schema.settings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(schema.settings.key, key));
  } else {
    await db.insert(schema.settings).values({ key, value });
  }
}

/**
 * 读取全部配置；若存在旧版扁平 provider 配置且尚无 provider_configs，
 * 自动迁移为新的 ProviderConfig 结构。
 */
export async function loadConfigs(db: ReturnType<typeof getDb>): Promise<{
  configs: ProviderConfig[];
  activeProvider: string | undefined;
}> {
  const raw = await getSetting(db, 'provider_configs');
  let configs = parseProviderConfigs(raw);
  let activeProvider = await getSetting(db, 'active_provider');

  // 旧版迁移：只有旧字段且没有新结构时执行一次
  if (configs.length === 0) {
    const oldKind = await getSetting(db, 'provider');
    const oldApiKey = await getSetting(db, 'api_key');
    const oldBaseUrl = await getSetting(db, 'base_url');
    if (oldKind) {
      const migrated: ProviderConfig = {
        id: oldKind,
        name: PROVIDERS.find((p) => p.id === oldKind)?.label ?? oldKind,
        kind: oldKind,
        apiKey: oldApiKey ?? undefined,
        baseUrl: oldBaseUrl ?? undefined,
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      configs = [migrated];
      activeProvider = activeProvider ?? oldKind;
      await setSetting(db, 'provider_configs', JSON.stringify(configs));
      if (activeProvider) await setSetting(db, 'active_provider', activeProvider);
    }
  }

  // 兼容：active_provider 指向的配置不存在或已停用时，自动落到第一个启用的配置
  if (!configs.find((c) => c.id === activeProvider && c.enabled)) {
    const fallback = configs.find((c) => c.enabled);
    activeProvider = fallback?.id;
    if (activeProvider) await setSetting(db, 'active_provider', activeProvider);
  }

  return { configs, activeProvider };
}

/** 持久化配置列表。 */
async function saveConfigs(db: ReturnType<typeof getDb>, configs: ProviderConfig[]): Promise<void> {
  await setSetting(db, 'provider_configs', JSON.stringify(configs));
}

function assertKind(kind: string): void {
  if (!PROVIDERS.find((p) => p.id === kind)) {
    throw Object.assign(new Error(`未知的供应商类型: ${kind}`), { statusCode: 400 });
  }
}

export async function providerConfigRoutes(app: FastifyInstance): Promise<void> {
  // ---- 列表 ----
  app.get('/api/provider-configs', async () => {
    const db = getDb();
    const { configs, activeProvider } = await loadConfigs(db);
    return { data: { configs, activeProvider } };
  });

  // ---- 新增 ----
  app.post<{
    Body: { name?: string; kind?: string; apiKey?: string; baseUrl?: string; model?: string; enabled?: boolean };
  }>('/api/provider-configs', async (req) => {
    const { name, kind, apiKey, baseUrl, model, enabled } = req.body ?? {};
    if (!kind) return { error: '缺少供应商类型' };
    assertKind(kind);

    const db = getDb();
    const { configs } = await loadConfigs(db);

    const config: ProviderConfig = {
      id: randomUUID(),
      name: name?.trim() || PROVIDERS.find((p) => p.id === kind)?.label || kind,
      kind,
      apiKey: apiKey?.trim() || undefined,
      baseUrl: baseUrl?.trim() || undefined,
      model: model?.trim() || undefined,
      enabled: enabled ?? true,
      createdAt: new Date().toISOString(),
    };
    configs.push(config);
    await saveConfigs(db, configs);

    // 首个配置自动设为当前使用
    const activeProvider = (await getSetting(db, 'active_provider'))
      ?? (config.enabled ? config.id : undefined);
    if (activeProvider) await setSetting(db, 'active_provider', activeProvider);

    return { data: config };
  });

  // ---- 更新 ----
  app.put<{
    Params: { id: string };
    Body: { name?: string; kind?: string; apiKey?: string; baseUrl?: string; model?: string; enabled?: boolean };
  }>('/api/provider-configs/:id', async (req) => {
    const { id } = req.params;
    const body = req.body ?? {};
    if (body.kind) assertKind(body.kind);

    const db = getDb();
    const { configs } = await loadConfigs(db);
    const index = configs.findIndex((c) => c.id === id);
    if (index < 0) return { error: '配置不存在' };

    const current = configs[index];
    const next: ProviderConfig = {
      ...current,
      name: body.name?.trim() || current.name,
      kind: body.kind ?? current.kind,
      // apiKey 传空字符串表示不修改；传 undefined 表示清空
      apiKey: body.apiKey === undefined ? current.apiKey : (body.apiKey?.trim() || undefined),
      baseUrl: body.baseUrl === undefined ? current.baseUrl : (body.baseUrl?.trim() || undefined),
      model: body.model === undefined ? current.model : (body.model?.trim() || undefined),
      enabled: body.enabled ?? current.enabled,
    };
    configs[index] = next;
    await saveConfigs(db, configs);
    return { data: next };
  });

  // ---- 删除 ----
  app.delete<{ Params: { id: string } }>('/api/provider-configs/:id', async (req) => {
    const { id } = req.params;
    const db = getDb();
    const { configs } = await loadConfigs(db);
    const next = configs.filter((c) => c.id !== id);
    await saveConfigs(db, next);

    // 删除的是当前使用的配置时，自动切换到第一个启用的配置
    const activeProvider = await getSetting(db, 'active_provider');
    if (activeProvider === id) {
      const fallback = next.find((c) => c.enabled)?.id;
      if (fallback) await setSetting(db, 'active_provider', fallback);
      else await setSetting(db, 'active_provider', '');
    }
    return { data: { deleted: id } };
  });

  // ---- 启用（设为当前使用） ----
  app.post<{ Params: { id: string } }>('/api/provider-configs/:id/enable', async (req) => {
    const { id } = req.params;
    const db = getDb();
    const { configs } = await loadConfigs(db);
    const index = configs.findIndex((c) => c.id === id);
    if (index < 0) return { error: '配置不存在' };

    if (!configs[index].enabled) {
      configs[index] = { ...configs[index], enabled: true };
      await saveConfigs(db, configs);
    }
    await setSetting(db, 'active_provider', id);
    return { data: { activeProvider: id } };
  });

  // ---- 停用 ----
  app.post<{ Params: { id: string } }>('/api/provider-configs/:id/disable', async (req) => {
    const { id } = req.params;
    const db = getDb();
    const { configs } = await loadConfigs(db);
    const index = configs.findIndex((c) => c.id === id);
    if (index < 0) return { error: '配置不存在' };

    configs[index] = { ...configs[index], enabled: false };
    await saveConfigs(db, configs);

    // 停用的是当前使用的配置时，自动切换到下一个启用的配置
    const activeProvider = await getSetting(db, 'active_provider');
    if (activeProvider === id) {
      const fallback = configs.find((c) => c.id !== id && c.enabled)?.id;
      if (fallback) await setSetting(db, 'active_provider', fallback);
      else await setSetting(db, 'active_provider', '');
    }
    return { data: { activeProvider: (await getSetting(db, 'active_provider')) ?? '' } };
  });
}
