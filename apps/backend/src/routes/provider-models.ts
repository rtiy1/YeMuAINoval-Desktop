/**
 * Provider 模型路由 — 从供应商真实 API 获取可用模型列表。
 *
 * 请求体可选 providerId：指定获取某个供应商的模型；
 * 不传时使用当前启用的供应商。
 */

import type { FastifyInstance } from 'fastify';

import { getDb } from '../db/index.js';
import { fetchProviderModels } from '../mcode/providers.js';
import { loadConfigs } from './provider-configs.js';

export async function providerModelRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body?: { providerId?: string } }>('/api/provider-models/fetch', async (req) => {
    const db = getDb();
    const { configs, activeProvider } = await loadConfigs(db);

    const providerId = req.body?.providerId || activeProvider;
    const config = configs.find((c) => c.id === providerId && c.enabled);

    if (!config) {
      return {
        data: {
          models: [],
          error: '尚未配置并启用供应商，请先到「设置 → 模型」中添加并启用',
        },
      };
    }

    const result = await fetchProviderModels(config);
    return { data: { ...result, providerName: config.name } };
  });
}
