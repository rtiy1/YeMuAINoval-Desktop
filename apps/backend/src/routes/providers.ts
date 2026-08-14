/**
 * Providers 路由 — 返回供应商目录。
 * 模型列表不在此处提供：请使用 POST /api/provider-models/fetch 从供应商真实 API 获取。
 */

import type { FastifyInstance } from 'fastify';

import { PROVIDERS } from '../mcode/providers.js';

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  // ---- 供应商目录 ----
  app.get('/api/providers', async () => {
    return {
      data: PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        needsBaseUrl: p.needsBaseUrl,
        needsApiKey: p.needsApiKey,
      })),
    };
  });
}
