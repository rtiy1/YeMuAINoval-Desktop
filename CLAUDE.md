# YeMu AI Novel Desktop

YeMu AI Novel Desktop 是本地优先的 AI 小说工作台。仓库使用 npm workspace，产品只提供 MCode 一个智能运行时。

## Repository map

- `packages/app`：Expo/React Native 客户端和桌面 renderer
- `packages/desktop`：Electron 主进程与安装包
- `packages/server`：本地 daemon、会话、文件和小说领域服务
- `packages/protocol`：客户端与 daemon 的共享协议
- `packages/client`：daemon 客户端 SDK
- `packages/mcode`：内置 MCode npm 运行时
- `docs/ai-novel-workbench-plan.md`：产品与实施路线

## Product rules

- 用户界面只展示 MCode，不提供其他 Provider 的安装或切换入口。
- 模型 API、密钥和模型 ID 在客户端“AI 模型”页面配置。
- 小说正文和故事圣经使用 Markdown/YAML 作为事实源。
- AI 写入必须可预览、可拒绝并可通过快照或 Git 恢复。
- 索引、人物关系图布局和统计数据属于可重建缓存。

## Quick start

```powershell
npm install
npm run dev:isolated
npm run mcode:version
```

隔离开发数据位于 `.dev/yemu-home`、`.dev/runtime-home` 和 `.dev/models`；Python 环境位于 `.venv`。

## Development rules

- 不要重启用户正在使用的主 daemon。
- 不要把超时直接判断为需要重启服务。
- 不要运行完整测试套件；只运行本次修改相关的测试文件。
- 修改后运行相关 workspace 的 typecheck、定向 lint 和格式检查。
- 跨 workspace 类型异常先重建依赖声明，再判断代码问题。
- 使用 npm scripts 执行格式化和 lint。
- 保持协议向后兼容：新增字段应为可选，不收窄已有 wire schema。
- 新 RPC 使用 `domain.operation.request/response` 命名。
- 兼容代码使用 `// COMPAT(name): added in vX, remove after YYYY-MM-DD` 标记。

## Platform rules

- 默认实现必须跨平台。
- DOM/WebGL 实现使用 `.web.tsx`；Electron 特有实现使用 `.electron.tsx`。
- 原生实现使用 `.native.tsx`，不要以 `Platform.OS` 代替布局断点。
- Electron renderer 保持 context isolation，原生能力通过参数受限的 preload bridge 暴露。
- 不受信任的远程内容禁止启用 Node.js integration。

## Relevant docs

- `docs/ai-novel-workbench-plan.md`
- `docs/architecture.md`
- `docs/coding-standards.md`
- `docs/design.md`
- `docs/forms.md`
- `docs/expo-router.md`
- `docs/protocol-compatibility.md`
- `docs/protocol-validation.md`
- `docs/testing.md`
- `SECURITY.md`
