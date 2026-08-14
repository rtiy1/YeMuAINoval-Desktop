# 夜幕 AI 小说桌面版

> 基于 MCode 的沉浸式 AI 小说写作工作台。以 MCode 为 Agent 大脑，Node + TypeScript 全栈，本地持久化。

## 架构

```
YeMuAINoval-Desktop/
├── packages/
│   └── mcode/                 # MCode Agent 运行时（Bun/TS，子进程消费）
├── apps/
│   ├── backend/               # Fastify + SQLite + MCode 子进程桥接
│   │   └── src/
│   │       ├── main.ts        # Fastify 启动入口
│   │       ├── db/            # Drizzle ORM + better-sqlite3
│   │       ├── routes/        # REST API（projects/volumes/chapters/characters/world-info）
│   │       ├── mcode/         # ★ MCodeBridge：NDJSON 子进程管理 + 上下文注入
│   │       └── ws/             # WebSocket 事件桥
│   ├── frontend/              # React 19 + Vite + Radix + TipTap
│   │   └── src/
│   │       ├── components/    # 三栏布局 + Agent 对话面板
│   │       └── features/      # projects/writing/characters/world-info/settings
│   └── desktop/               # Electron 外壳
```

## 核心设计

### MCode 集成
MCode 只能作为**子进程**消费（无进程内 SDK）。通过 NDJSON stdin/stdout 协议通信：
- 启动：`mcode -p --input-format stream-json --output-format stream-json --verbose --session-id <uuid>`
- 输入：`{ type: 'user', message: { role: 'user', content: string } }`
- 输出：`system` / `assistant` / `stream_event` / `result` 等 NDJSON 事件

`MCodeBridge`（`apps/backend/src/mcode/bridge.ts`）封装此契约：
- 每个项目会话映射到一个长驻 MCode 子进程
- 逐行解析 stdout NDJSON → 归一化事件 → 经 WebSocket 转发前端
- 发消息前自动注入角色档案、世界观、章节前文作为上下文

### 数据模型
SQLite 本地持久化，7 张表：projects / volumes / chapters / characters / world_info / agent_sessions / settings。

## 快速开始

### 前置要求
- Node.js >= 22
- pnpm 11+（`npm i -g pnpm`）
- Bun 1.3+（MCode 运行时，`npm i -g bun@1.3.14`）

### 安装
```bash
pnpm install
```

### 开发模式
```bash
# 终端 1：后端（http://127.0.0.1:8787）
pnpm dev:backend

# 终端 2：前端（http://localhost:5173）
pnpm dev:frontend
```

打开 http://localhost:5173 即可使用。前端开发服务器已配置代理，`/api` 和 `/ws` 自动转发到后端。

### 桌面应用
```bash
pnpm dev:desktop
```
Electron 会自动启动后端子进程并加载前端。

### 配置 AI 模型
在应用内「设置」页面配置：
- 模型提供商（anthropic / openai / custom）
- API Key
- Base URL（可选）
- 模型名称

这些凭据保存在本地 SQLite，仅在 MCode 子进程启动时通过环境变量注入。

## 技术栈

| 层 | 技术 |
|---|---|
| Agent 大脑 | MCode（Bun/TS 子进程，NDJSON 协议） |
| 后端 | Fastify + better-sqlite3 + Drizzle ORM |
| 前端 | React 19 + Vite + Radix Themes + TipTap + zustand |
| 实时通信 | WebSocket（后端 ws ↔ 前端原生 WebSocket） |
| 桌面 | Electron |

## 功能

- ✅ 项目管理（创建/编辑/删除，自动生成默认卷）
- ✅ 分卷与章节管理（卷/章节树、拖拽排序）
- ✅ 沉浸式编辑器（TipTap Markdown、自动保存、中文字数统计）
- ✅ 角色档案（姓名/定位/简介/外貌/性格/背景）
- ✅ 世界观设定（地点/组织/物品/规则）
- ✅ AI 协作面板（流式输出、中断、工具调用展示、上下文注入）
- ✅ 本地持久化（零云依赖，隐私安全）
s

## 许可证

私有项目。
