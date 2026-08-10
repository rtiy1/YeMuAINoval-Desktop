# YeMu AI Novel Desktop 实施规划

## 1. 已确认的产品决策

1. YeMu AI Novel Desktop 是一个项目，客户端、服务端和 MCode 运行时共享同一工程与发布流程。
2. MCode 是产品内置的唯一智能运行时，不在界面中提供 Provider 安装、切换或扩展入口。
3. 用户在客户端配置 API 地址、API 密钥和模型档案；界面名称统一为“AI 模型”，不再叫“Providers”。
4. 小说正文和设定使用本地 Markdown/YAML 文件作为事实源。
5. 人物关系图使用可缩放、可拖拽、可筛选的蜘蛛网式关系网络。
6. AI 生成的设定、关系和正文修改必须先形成可审核变更，不能静默覆盖作者内容。

## 2. 当前整合基线

本轮已经完成工程物理归一：

- 仓库根目录直接承载 `package.json`、`packages/`、`docs/`、`.venv/` 和 `.dev/`；
- MCode 位于 `packages/mcode`，是根 npm workspace 中的内部运行时包；
- 根应用、Electron 安装包和 Expo 应用已改为 YeMu AI Novel 身份；
- 历史发布账号、应用 ID 和 EAS 提交信息已经移除；
- 开发数据使用 `.dev/yemu-home`、`.dev/runtime-home` 和 `.dev/models`；
- `.venv` 位于唯一的项目根目录。

当前仍保留一部分历史包名、内部环境变量和未注册的旧适配器源码。它们属于协议兼容层，将在第一阶段按依赖顺序清理。

## 3. 单项目目标结构

```text
YeMuAINoval-Desktop/
├─ packages/
│  ├─ app/                 # 客户端 UI：桌面、Web、移动共用
│  ├─ desktop/             # Electron 主进程、安装与系统能力
│  ├─ server/              # 本地 daemon、会话、文件和小说服务
│  ├─ protocol/            # 客户端与 daemon 的共享协议
│  ├─ client/              # daemon 客户端 SDK
│  ├─ mcode/               # 唯一 AI 运行时，可独立 npm pack
│  ├─ novel-core/          # 新增：小说 Schema、引用和领域规则
│  └─ novel-mcp/           # 新增：提供给 MCode 的小说工具
├─ docs/
├─ scripts/
├─ .dev/                   # 忽略提交的开发数据
├─ .venv/                  # 忽略提交的 Python 环境
├─ package.json
└─ README.md
```

`packages/mcode` 保留单独的 npm package，是因为服务端需要稳定的运行时边界和可打包产物；它不拥有独立应用配置、独立开发入口或独立产品文档。

## 4. 最终客户端信息架构

桌面端采用五个一级工作区：

1. **项目库**：小说封面、题材、当前进度、字数和最近编辑。
2. **创作台**：卷章导航、正文编辑器、MCode 助手和修改建议。
3. **故事圣经**：人物、地点、势力、物品、世界规则和术语。
4. **故事结构**：大纲、情节线、时间线、伏笔和人物关系图。
5. **设置**：AI 模型、外观、编辑器、数据与导出。

桌面创作台默认三栏：

```text
┌──────────────┬──────────────────────────────┬──────────────────┐
│ 卷 / 章 / 场景 │ 正文编辑器                    │ MCode 助手         │
│ 故事圣经入口   │ Markdown / 修订 Diff          │ 上下文 / 工具 / 建议 │
└──────────────┴──────────────────────────────┴──────────────────┘
```

“Host、Agent、Provider、Terminal”等开发工具术语从默认创作界面移出。诊断和终端保留在高级设置中。

## 5. 客户端 AI 模型配置

### 5.1 产品模型

产品只有 MCode 一个智能运行时，但允许配置多个“模型档案”。用户选择的是模型档案，不是 Provider。

第一版支持：

- Anthropic 官方 API；
- 实现 Anthropic Messages 协议的兼容 API；
- 自定义模型 ID、快速模型 ID、Base URL 和附加请求头。

OpenAI Compatible、Ollama、Bedrock 和 Vertex 不在第一版伪装成可用选项。MCode 当前的工具调用、思考块和流式协议以 Anthropic Messages 为基础；增加其他协议必须先实现并验证传输适配器。

### 5.2 配置数据

非敏感配置写入 daemon 配置，密钥单独保存：

```ts
interface AiModelProfile {
  id: string;
  name: string;
  protocol: "anthropic" | "anthropic-compatible";
  baseUrl: string | null;
  model: string;
  smallFastModel: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  customHeaders: Record<string, string>;
  credentialId: string | null;
  isDefault: boolean;
  enabled: boolean;
}
```

客户端永远只拿到 `credentialId`、`hasCredential` 和掩码提示，不允许从 RPC 读回明文密钥。

### 5.3 页面与交互

设置中新增“AI 模型”页面：

- 模型档案列表；
- 新建、复制、编辑、删除和设为默认；
- API 地址、API Key、模型 ID、快速模型 ID；
- “测试连接”按钮，显示连通性、鉴权结果、模型可用性和耗时；
- 高级区域配置上下文长度、输出限制和自定义 Header；
- 会话启动前若没有可用档案，直接引导到配置页。

移除现有 Provider 开关、Provider 诊断抽屉和 Provider 选择器。创作页只显示“模型档案 / 模型 / 思考强度”。

### 5.4 密钥安全

- Electron：主进程调用 `safeStorage` 异步 API，使用 Windows DPAPI、macOS Keychain 或 Linux Secret Service；
- Android/iOS：使用 `expo-secure-store`；
- 浏览器 Web：不持久化 API Key，只允许会话级输入；
- renderer 不接触 Electron 原生 API，只通过参数受限的 preload bridge 调用；
- RPC、日志、诊断报告和错误消息统一做 API Key 脱敏；
- daemon 只在启动对应 MCode 会话时把密钥注入子进程环境，结束后释放内存引用。

需要新增的协议和模块：

```text
packages/protocol/src/ai-models/
packages/app/src/features/ai-models/
packages/desktop/src/features/credential-vault/
packages/server/src/server/ai-models/
```

建议 RPC：

- `ai.models.list.request/response`
- `ai.models.upsert.request/response`
- `ai.models.remove.request/response`
- `ai.models.test.request/response`
- `ai.credentials.set.request/response`（只写）
- `ai.credentials.remove.request/response`

MCode 启动时由档案映射到：

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_SMALL_FAST_MODEL`
- `ANTHROPIC_CUSTOM_HEADERS`

### 5.5 完成标准

- 用户不编辑配置文件或环境变量即可完成模型配置；
- 重启应用后档案仍在，客户端不能读回密钥明文；
- 测试连接通过后能创建 MCode 会话并收到流式文本和工具调用；
- 两个会话可以选择不同档案，环境变量不能互相泄漏；
- 导出的诊断报告不包含 API Key、Authorization Header 或完整密钥路径。

## 6. 小说项目数据模型

每部小说是一个普通目录：

```text
my-novel/
├─ novel.yaml
├─ manuscript/
│  ├─ volume-01/
│  │  ├─ chapter-001.md
│  │  └─ chapter-002.md
│  └─ fragments/
├─ outline/
│  ├─ master.md
│  ├─ arcs.yaml
│  └─ beats.yaml
├─ story-bible/
│  ├─ characters/
│  ├─ locations/
│  ├─ factions/
│  ├─ items/
│  └─ rules.yaml
├─ timeline/events.yaml
├─ relationships.yaml
├─ research/
├─ assets/
├─ exports/
└─ .yemu/
   ├─ index.sqlite
   ├─ graph-layout.json
   └─ snapshots/
```

规则：

- 正文和可读设定是事实源；
- `.yemu/` 只存可重建索引、布局和快照；
- 所有人物、地点、事件和关系拥有稳定 ID；
- 正文可以通过 `[[character:lin-wan]]`、`[[location:old-city]]` 建立显式引用；
- Schema 使用 `schemaVersion`，升级由 `novel-core` 提供迁移器；
- AI 写操作先创建快照，再产生可审核 Diff。

## 7. 蜘蛛网人物关系图

### 7.1 目标形态

关系图不是静态流程图，而是可探索的力导向网络：

- 核心人物位于中心；
- 一度关系形成内圈，二度关系形成外圈；
- 势力和阵营形成自然聚类；
- 关系越强，连线越粗、节点吸引力越高；
- 敌对、亲属、情感、同盟、上下级、师徒、债务和秘密使用不同颜色或线型；
- 有方向的关系显示箭头，例如“崇拜”“控制”“追杀”；
- 隐藏关系默认模糊或隐藏，防止提前剧透。

### 7.2 数据格式

`relationships.yaml` 保存作者确认过的关系：

```yaml
schemaVersion: 1
relationships:
  - id: rel-linwan-guye
    source: char-lin-wan
    target: char-gu-ye
    type: alliance
    label: 临时同盟
    direction: bidirectional
    strength: 4
    status: active
    fromChapter: chapter-012
    toChapter: null
    public: true
    notes: 双方仍互不信任
```

节点从 `story-bible/characters/*.yaml` 读取，边从 `relationships.yaml` 读取。图布局坐标写入 `.yemu/graph-layout.json`，拖拽节点不会污染故事设定。

### 7.3 技术实现

Electron/Web 主实现：

- `graphology` 管理节点、边和图算法；
- `graphology-layout-forceatlas2` 在 Web Worker 中计算蜘蛛网布局；
- `sigma` 使用 WebGL 渲染和交互；
- 关系标签和详情卡使用 React Native Web 叠层；
- 通过 `.electron.tsx` / `.web.tsx` 隔离 DOM 与 WebGL 实现。

移动端第一版提供只读的简化 SVG 视图；桌面交互稳定后再决定是否引入原生 Canvas/Skia。现有应用已经依赖 `react-native-svg`，不需要为了第一版关系图重做跨平台渲染器。

代码位置：

```text
packages/app/src/features/novel/relationship-graph/
├─ model.ts
├─ filters.ts
├─ graph-store.ts
├─ view.electron.tsx
├─ view.web.tsx
├─ view.native.tsx
├─ inspector.tsx
└─ *.test.ts
```

服务端返回与渲染库无关的快照：

```ts
interface RelationshipGraphSnapshot {
  projectId: string;
  revision: number;
  nodes: CharacterGraphNode[];
  edges: CharacterRelationshipEdge[];
}
```

### 7.4 用户交互

- 滚轮缩放、画布拖动、框选和重置视图；
- 拖动节点并保存个人布局；
- 搜索人物并自动聚焦；
- 单击查看人物卡，双击进入人物详情；
- “全局网络”和“以此人物为中心”两种模式；
- 按卷/章查看某个时间点的关系；
- 按势力、关系类型、人物状态和剧透级别筛选；
- 高亮两个人物之间的最短关系链；
- MCode 可提出新增/修改关系，但必须由作者确认后写入 YAML。

### 7.5 性能和验收

- 500 个节点、2000 条边的项目在目标桌面机上两秒内可交互；
- ForceAtlas2 在 Worker 中运行，布局过程不能阻塞正文输入；
- 平移和缩放目标保持 45 FPS 以上；
- 项目文件修改后采用增量更新，不重建整个图；
- 删除人物时提示受影响关系，不产生悬空边；
- YAML 解析失败时保留上一个有效快照并定位到具体文件和字段。

## 8. MCode 小说能力

新增 `packages/novel-mcp`，第一批工具只覆盖高价值操作：

- `novel.get_project_context`
- `novel.read_chapter`
- `novel.propose_chapter_patch`
- `novel.query_canon`
- `novel.list_characters`
- `novel.propose_relationship`
- `novel.check_consistency`
- `novel.create_snapshot`

所有写操作返回 Patch，不直接覆写。客户端以 Diff、字段变更或关系卡片展示，作者可以逐项接受或拒绝。

MCode 的系统提示由以下上下文拼装：

1. 小说元数据和文风规范；
2. 当前章节正文与章节目标；
3. 当前涉及的人物、地点和关系；
4. 最近章节摘要；
5. 与当前任务相关的规则和伏笔。

禁止每次把整部小说塞进上下文。上下文包必须可查看、可统计 Token，并记录实际注入来源。

## 9. 实施顺序与工期

### 阶段 A：单项目清理（2–3 个工作日）

- 将内部包作用域分批迁移到 `@yemu/*`；
- 把用户可见的历史文案、图标、协议名和默认路径改为 YeMu；
- 历史环境变量作为带期限的兼容别名保留，新代码只使用 `YEMU_*`；
- 删除未注册 Provider 的产品代码和不再使用的依赖；
- 评估并移除网站、云 Relay、旧发布流水线等无关发行面。

完成标准：根目录、安装包、应用界面、日志和配置目录只展示 YeMu 产品身份；MCode 仍能 npm pack 和启动。

### 阶段 B：客户端 AI 模型配置（4–6 个工作日）

- 新协议、模型档案 Schema 和凭证存储；
- AI 模型设置页和测试连接；
- MCode 会话按档案注入环境；
- 删除 Provider 选择 UI；
- 密钥脱敏、安全和跨会话隔离测试。

完成标准：全新安装用户只通过客户端即可完成配置并开始一次真实 MCode 会话。

### 阶段 C：小说项目 MVP（6–8 个工作日）

- `novel-core` Schema；
- 新建小说向导和标准目录；
- 卷章树、Markdown 编辑器和自动保存；
- 人物、地点、势力基础表单；
- Git/快照恢复。

完成标准：用户可以创建项目、建立人物、撰写多章正文并恢复任意一次 AI 修改。

### 阶段 D：只读人物关系图（5–7 个工作日）

- `relationships.yaml` 解析与校验；
- Graphology/Sigma/ForceAtlas2 渲染；
- 搜索、聚焦、过滤、拖拽和布局保存；
- 人物详情联动和性能基准。

完成标准：一个真实中篇项目可以稳定浏览蜘蛛网关系，编辑正文时布局计算不造成卡顿。

### 阶段 E：关系编辑与 MCode 提取（4–6 个工作日）

- 图形化新增、编辑和删除关系；
- MCode 从正文提取候选人物和关系；
- 候选变更审核队列；
- 关系随章节变化和剧透过滤。

完成标准：AI 不会未经确认改变人物关系，所有接受的变更可定位到来源章节并可撤销。

### 阶段 F：长篇写作工作流（8–12 个工作日）

- 大纲、时间线、伏笔和章节状态；
- SQLite FTS 索引和上下文包；
- 连续性检查、改写 Diff 和批量修订；
- DOCX、EPUB、PDF 和纯文本导出。

## 10. 测试边界

必须建立以下定向测试：

- 模型档案 Schema、迁移和默认选择；
- 凭证永不出现在快照、日志、诊断和错误中；
- 不同模型档案的 MCode 进程环境隔离；
- 中文章节文件名、全角标点和字数统计；
- 关系 YAML 的悬空引用、重复 ID 和章节范围；
- 图筛选、最短路径、焦点模式和布局持久化；
- MCode 提议写入前后的快照与撤销；
- 500/2000 图数据集的布局和交互基准。

不在本地运行全量测试套件。每一阶段运行变更文件的定向测试、相关 workspace 类型检查、lint 和格式检查。

## 11. 当前优先级

下一步只做阶段 A 和阶段 B。AI 模型配置完成之前，不开始大规模小说 UI；否则真实模型会话、凭证和模型选择仍依赖旧 Provider 结构，后续页面会发生二次返工。

关系图在小说项目 Schema 稳定后开始。先确定人物 ID、关系 ID 和章节范围，再实现渲染器，避免把 UI 临时数据反向固化成项目文件格式。

## 12. 技术依据

- Electron `safeStorage`：<https://www.electronjs.org/docs/latest/api/safe-storage>
- Electron Context Isolation：<https://www.electronjs.org/docs/latest/tutorial/context-isolation>
- Expo SecureStore：<https://docs.expo.dev/versions/latest/sdk/securestore/>
- Sigma.js：<https://www.sigmajs.org/docs/>
- Graphology ForceAtlas2：<https://graphology.github.io/standard-library/layout-forceatlas2.html>
