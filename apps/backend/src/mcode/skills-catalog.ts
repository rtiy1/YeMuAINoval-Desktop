/**
 * 技能与命令目录 — 后端独立维护的静态元数据。
 *
 * 来源：手工从 packages/mcode/src/skills/bundled 目录下各 .ts 文件和
 * packages/mcode/src/commands 各子目录的 index.ts 提取。
 *
 * 为什么独立维护而非 import：
 *   MCode 包的 exports 只暴露 ./runtime，技能源文件依赖 bun:bundle 宏
 *   （Dead Code Elimination），Node/tsx 后端无法执行这些模块。
 *   因此后端复制一份元数据常量，通过 /api/skills 和 /api/commands 暴露给前端。
 *
 * 同步约定：MCode 技能更新时，对照源文件更新此目录。
 *   源文件：packages/mcode/src/skills/bundled 目录下的 <name>.ts
 *           packages/mcode/src/commands 目录下 <name>/index.ts
 */

import type { SkillCatalogEntry, CommandCatalogEntry } from './skill-catalog-types.js';

/**
 * 类型定义的本地副本（避免从 @yemu/mcode 包导入触发 Bun 依赖）。
 * 与 packages/mcode/src/skill-catalog.ts 保持一致。
 */
export type { SkillCatalogEntry, CommandCatalogEntry } from './skill-catalog-types.js';

/**
 * 技能目录。
 *
 * restricted 字段说明：
 *   true  = MCode 中该技能受 USER_TYPE === 'ant' 或 feature() 开关限制，
 *           外部用户可能无法使用（标注供前端展示锁定徽章）
 *   false = 外部构建版本中始终注册
 *
 * custom 技能（source: 'custom'）是本项目的写作提示模板，
 * 选中后作为预置提示词插入 composer，由 MCode 作为普通消息处理。
 */
export const SKILL_CATALOG: SkillCatalogEntry[] = [
  // ---- 写作辅助（custom 提示模板）----
  {
    name: 'novel-continue',
    description: '续写当前章节。根据已有正文、角色档案和世界观设定，自然延续剧情。',
    whenToUse: '当用户想要 AI 续写当前正在编辑的章节内容时使用。',
    argumentHint: '[续写方向提示]',
    userInvocable: true,
    source: 'custom',
    restricted: false,
    category: 'writing',
  },
  {
    name: 'novel-outline',
    description: '生成或补全大纲。根据项目设定生成分卷/章节大纲结构。',
    whenToUse: '当用户想要规划故事结构、生成卷章大纲时使用。',
    argumentHint: '[主题或方向]',
    userInvocable: true,
    source: 'custom',
    restricted: false,
    category: 'writing',
  },
  {
    name: 'novel-character',
    description: '角色深化。为指定角色扩展外貌、性格、背景故事、成长弧线。',
    whenToUse: '当用户想要丰富角色设定、增加角色层次感时使用。',
    argumentHint: '[角色名]',
    userInvocable: true,
    source: 'custom',
    restricted: false,
    category: 'writing',
  },
  {
    name: 'novel-review',
    description: '文风与连贯性审查。检查前后文一致性、文风统一性、伏笔逻辑。',
    whenToUse: '当用户想要审查章节质量、发现前后矛盾时使用。',
    argumentHint: '[章节范围]',
    userInvocable: true,
    source: 'custom',
    restricted: false,
    category: 'writing',
  },

  // ---- MCode 内置：写作/代码审查 ----
  {
    name: 'simplify',
    description: '审查变更的复用性、质量和效率，然后修复发现的问题。',
    whenToUse: '当用户想要审查并清理最近修改的内容时使用。',
    userInvocable: true,
    source: 'bundled',
    restricted: false,
    category: 'writing',
  },

  // ---- MCode 内置：记忆 ----
  {
    name: 'remember',
    description: '审查自动记忆条目，提议提升到 MCODE.md、MCODE.local.md 或共享记忆。检测过期、冲突和重复条目。',
    whenToUse: '当用户想要审查、整理或提升自动记忆条目时使用。也用于清理跨记忆层的过期和冲突条目。',
    userInvocable: true,
    source: 'bundled',
    restricted: true,
    category: 'memory',
  },

  // ---- MCode 内置：调试 ----
  {
    name: 'debug',
    description: '启用调试日志并帮助诊断问题。',
    whenToUse: '当用户遇到问题、想要启用调试日志诊断会话时使用。',
    argumentHint: '[问题描述]',
    userInvocable: true,
    source: 'bundled',
    restricted: false,
    category: 'debugging',
  },
  {
    name: 'verify',
    description: '通过运行应用验证代码变更是否达到预期效果。',
    whenToUse: '当用户想要验证一个变更是否正确工作时使用。',
    userInvocable: true,
    source: 'bundled',
    restricted: true,
    category: 'debugging',
  },

  // ---- MCode 内置：系统 ----
  {
    name: 'update-config',
    description: '通过 settings.json 配置 MCode。用于权限管理、环境变量、钩子故障排查等。',
    whenToUse: '当用户想要配置自动化行为（"每次 X 时..."）、权限规则、环境变量、钩子时使用。',
    userInvocable: true,
    source: 'bundled',
    restricted: false,
    category: 'system',
  },
  {
    name: 'keybindings-help',
    description: '自定义键盘快捷键、重新绑定按键、添加组合键。',
    whenToUse: '当用户想要自定义键盘快捷键时使用。',
    userInvocable: false,
    source: 'bundled',
    restricted: false,
    category: 'system',
  },

  // ---- MCode 内置：代码 ----
  {
    name: 'batch',
    description: '研究并规划大规模变更，然后在 5–30 个隔离的 worktree agent 中并行执行。',
    whenToUse: '当用户想要进行大规模、机械式变更（迁移、重构、批量重命名）时使用。',
    argumentHint: '<instruction>',
    userInvocable: true,
    source: 'bundled',
    restricted: false,
    category: 'code',
  },
];

/**
 * 斜杠命令目录。
 *
 * 来源：packages/mcode/src/commands/<name>/index.ts 中导出的 Command 对象。
 * 仅收录对小说写作场景有用、且外部用户可用的命令（排除 ant-only 和 feature-gated）。
 */
export const COMMAND_CATALOG: CommandCatalogEntry[] = [
  { name: 'clear', description: '清空对话历史并释放上下文' },
  {
    name: 'compact',
    description: '清空对话历史但保留摘要。可选：/compact [摘要指令]',
    argumentHint: '<可选摘要指令>',
  },
  { name: 'help', description: '显示帮助和可用命令' },
  { name: 'memory', description: '编辑 MCode 记忆文件' },
  { name: 'status', description: '查看 MCode 状态：版本、模型、账户、API 连通性' },
  { name: 'cost', description: '查看本次会话的总花费和时长' },
  { name: 'doctor', description: '诊断并验证 MCode 安装和设置' },
  { name: 'mcp', description: '管理 MCP 服务器', argumentHint: '[enable|disable [server-name]]' },
  { name: 'skills', description: '列出可用技能' },
  { name: 'context', description: '可视化当前上下文使用情况' },
];

/** 默认启用的技能（首次使用时的初始值）。 */
export const DEFAULT_ENABLED_SKILLS: string[] = [
  'novel-continue',
  'novel-outline',
  'novel-character',
  'novel-review',
  'simplify',
];
