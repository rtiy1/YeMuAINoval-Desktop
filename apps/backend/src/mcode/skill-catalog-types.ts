/**
 * 技能目录类型 — 后端本地副本。
 *
 * 与 packages/mcode/src/skill-catalog.ts 保持一致。
 * 独立维护以避免从 @yemu/mcode 包导入（该包技能模块依赖 bun:bundle）。
 */

export type SkillSource = 'bundled' | 'custom';

export type SkillCategory = 'writing' | 'memory' | 'debugging' | 'system' | 'code';

export interface SkillCatalogEntry {
  name: string;
  description: string;
  whenToUse?: string;
  argumentHint?: string;
  userInvocable: boolean;
  source: SkillSource;
  restricted: boolean;
  category: SkillCategory;
}

export interface CommandCatalogEntry {
  name: string;
  description: string;
  argumentHint?: string;
}
