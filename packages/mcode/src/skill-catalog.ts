/**
 * 技能目录类型定义 — 前后端共享的数据契约。
 *
 * MCode 的技能元数据无法被后端直接导入（包只暴露 ./runtime，
 * 技能源文件依赖 bun:bundle 宏，Node 无法执行）。
 * 因此后端独立维护一份 catalog 常量（apps/backend/src/mcode/skills-catalog.ts），
 * 此文件仅提供类型契约，确保前后端数据结构对齐。
 *
 * 元数据来源：手工从 packages/mcode/src/skills/bundled/*.ts 提取。
 * MCode 技能更新时需手动同步。
 */

export type SkillSource = 'bundled' | 'custom';

export type SkillCategory = 'writing' | 'memory' | 'debugging' | 'system' | 'code';

export interface SkillCatalogEntry {
  /** 技能名（对应 MCode 的 /skill 调用名）。 */
  name: string;
  /** 一句话描述。 */
  description: string;
  /** 何时使用（模型判断依据）。 */
  whenToUse?: string;
  /** 参数提示。 */
  argumentHint?: string;
  /** 是否用户可调用（非模型自动触发）。 */
  userInvocable: boolean;
  /** 来源：bundled（MCode 内置）或 custom（本项目自定义提示模板）。 */
  source: SkillSource;
  /**
   * 是否受 ant/feature 限制。
   * MCode 中部分技能仅 USER_TYPE === 'ant' 可用或受编译开关控制。
   * 此字段仅标注，不实际判断——外部用户的实际可用性取决于 MCode 构建版本。
   */
  restricted: boolean;
  /** 对小说场景的分类标签。 */
  category: SkillCategory;
}

export interface CommandCatalogEntry {
  /** 命令名（不含 /）。 */
  name: string;
  /** 一句话描述。 */
  description: string;
  /** 参数提示。 */
  argumentHint?: string;
}
