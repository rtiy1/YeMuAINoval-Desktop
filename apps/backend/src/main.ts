/**
 * 夜幕 AI 小说桌面版后端入口。
 *
 * Fastify + SQLite + MCode 子进程桥接。
 * 启动顺序：初始化数据库 → 注册路由 → 注册 WS → 启动 HTTP。
 */

import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';

import { config } from './config.js';
import { closeDb, initDb } from './db/index.js';
import { agentSessionRoutes } from './routes/agent-sessions.js';
import { chapterRoutes } from './routes/chapters.js';
import { characterRoutes } from './routes/characters.js';
import { messageRoutes } from './routes/messages.js';
import { projectRoutes } from './routes/projects.js';
import { providerRoutes } from './routes/providers.js';
import { providerConfigRoutes } from './routes/provider-configs.js';
import { providerModelRoutes } from './routes/provider-models.js';
import { settingsRoutes } from './routes/settings.js';
import { skillRoutes } from './routes/skills.js';
import { volumeRoutes } from './routes/volumes.js';
import { worldInfoRoutes } from './routes/world-info.js';
import { wsRoutes } from './ws/agent-events.js';

async function main(): Promise<void> {
  // 1. 初始化数据库
  initDb();

  // 2. 创建 Fastify 实例
  const app = Fastify({
    logger: config.IS_DEV,
  });

  // 3. 注册插件
  await app.register(cors, {
    origin: true, // 开发模式允许所有来源
  });
  await app.register(websocket);

  // 4. 注册 REST 路由
  await app.register(projectRoutes);
  await app.register(volumeRoutes);
  await app.register(chapterRoutes);
  await app.register(characterRoutes);
  await app.register(worldInfoRoutes);
  await app.register(settingsRoutes);
  await app.register(providerRoutes);
  await app.register(providerConfigRoutes);
  await app.register(providerModelRoutes);
  await app.register(skillRoutes);
  await app.register(messageRoutes);
  await app.register(agentSessionRoutes);

  // 5. 注册 WebSocket 路由
  await app.register(wsRoutes);

  // 6. 生产模式下静态托管前端构建产物
  if (!config.IS_DEV && existsSync(config.FRONTEND_DIST)) {
    await app.register(fastifyStatic, {
      root: config.FRONTEND_DIST,
      prefix: '/',
      wildcard: false,
    });
    // SPA fallback：未匹配的路由返回 index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not Found' });
    });
  }

  // 7. 健康检查
  app.get('/api/health', () => ({ status: 'ok', version: '0.1.0' }));

  // 8. 启动
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`夜幕 AI 小说后端已启动: http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // 9. 优雅退出
  const shutdown = async (signal: string) => {
    app.log.info(`收到 ${signal}，正在关闭...`);
    await app.close();
    closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
