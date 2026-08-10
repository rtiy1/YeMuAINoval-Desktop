# YeMu AI Novel Desktop

夜幕 AI 小说工作台是一个本地优先的桌面创作应用。客户端、小说项目服务、MCode 智能运行时和桌面外壳位于同一个 npm monorepo。

当前产品只有一个智能运行时：MCode。后续的 API 地址、密钥和模型档案统一在客户端的“AI 模型”页面配置。

## 开发环境

- Node.js 24+
- npm 11+
- Python 3.12+

MCode 所需的 Bun 由 npm workspace 安装，不要求全局安装。Python 虚拟环境位于项目根目录 `.venv`。

```powershell
npm install
npm run dev:isolated
```

首次启动也可以让隔离脚本安装依赖：

```powershell
npm run dev:isolated -- -Install
```

运行数据保存在项目根目录下：

- `.dev/yemu-home`：应用与 daemon 数据；
- `.dev/runtime-home`：MCode 运行配置；
- `.dev/models`：本地模型文件；
- `.venv`：Python 辅助工具环境。

## 项目结构

```text
YeMuAINoval-Desktop/
├─ packages/
│  ├─ app/             # Expo/React Native 客户端
│  ├─ desktop/         # Electron 桌面外壳
│  ├─ server/          # 本地服务、会话和小说领域服务
│  ├─ protocol/        # 客户端/服务端共享协议
│  ├─ client/          # daemon 客户端 SDK
│  └─ mcode/           # 内置 MCode npm 运行时
├─ docs/
├─ scripts/
├─ .venv/
├─ package.json
└─ README.md
```

`packages/mcode` 是产品内部运行时包，不是另一套应用。桌面端通过服务端直接启动它并接收流式文本、推理、工具调用和权限事件。

## 常用命令

```powershell
npm run mcode:version
npm run mcode -- --help
npm pack --dry-run --workspace=@yemu/mcode
npm run build:server-deps
npm --workspace packages/server run typecheck
```

产品实施路线见 [AI 小说工作台规划](docs/ai-novel-workbench-plan.md)。

## 上游与许可证

基础代码遵循根目录 `LICENSE` 中的 AGPL-3.0-or-later 许可证。MCode 的再分发与 npm 发布需要在正式发行前完成独立许可证确认。
