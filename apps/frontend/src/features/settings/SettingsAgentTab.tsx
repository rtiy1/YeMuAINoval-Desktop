/**
 * Agent 行为设置 Tab — 交互行为、权限默认模式、预算上限。
 *
 * 所有设置持久化到后端 settings KV。
 */

import { Bot, MessageSquare, Shield, Coins, Repeat, PenLine } from 'lucide-react';
import { clsx } from 'clsx';

import type { Settings } from '@/lib/types';

interface AgentTabProps {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
}

const INTERACTION_OPTIONS = [
  { id: 'queue', label: '排队', description: '新消息排队等待，避免打断正在进行的生成' },
  { id: 'immediate', label: '立即', description: '新消息立即处理，可能中断当前生成' },
] as const;

const PERMISSION_OPTIONS = [
  { id: 'default', label: '默认', description: '每次操作前询问' },
  { id: 'plan', label: '规划', description: '只规划不执行' },
  { id: 'acceptEdits', label: '接受编辑', description: '自动接受文件编辑' },
  { id: 'bypassPermissions', label: '跳过权限', description: '跳过所有权限检查（危险）' },
] as const;

export function SettingsAgentTab({ settings, onSettingsChange }: AgentTabProps) {
  const interaction = settings.interaction_behavior || 'queue';
  const permission = settings.default_permission_mode || 'default';
  const maxTurns = settings.max_turns || '';
  const maxBudget = settings.max_budget_usd || '';
  const writingStyle = settings.writing_style || '';

  return (
    <div className="settings-tab-content">
      {/* 写作风格指令 */}
      <section className="settings-section">
        <h3 className="settings-section-title">
          <PenLine size={15} />
          写作风格指令
        </h3>
        <p className="settings-section-desc">
          全局写作风格指令，注入 Agent 系统提示。用于规定文风、叙事视角、术语约定等。
          <br />
          <span className="settings-note-warn">
            注：风格指令在新建会话时生效，已有会话需重新创建才能应用。
          </span>
        </p>
        <textarea
          className="input settings-textarea"
          value={writingStyle}
          onChange={(e) => onSettingsChange({ writing_style: e.target.value })}
          placeholder={'例如：\n你的文风是简洁有力的叙事，避免冗长心理描写。\n术语统一：跃迁=超光速移动，灵能=精神力操控。\n第三人称视角，多用对话推进剧情。'}
          rows={6}
        />
      </section>

      {/* 交互行为 */}
      <section className="settings-section">
        <h3 className="settings-section-title">
          <MessageSquare size={15} />
          交互行为
        </h3>
        <p className="settings-section-desc">
          Agent 正在生成时，新消息如何处理。
        </p>
        <div className="settings-options-grid">
          {INTERACTION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={clsx('settings-option-card', interaction === opt.id && 'settings-option-card--selected')}
              onClick={() => onSettingsChange({ interaction_behavior: opt.id })}
            >
              <div className="settings-option-card-label">{opt.label}</div>
              <div className="settings-option-card-desc">{opt.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* 权限默认模式 */}
      <section className="settings-section">
        <h3 className="settings-section-title">
          <Shield size={15} />
          权限默认模式
        </h3>
        <p className="settings-section-desc">
          新建 Agent 会话时的默认权限模式。
        </p>
        <div className="settings-options-grid">
          {PERMISSION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={clsx('settings-option-card', permission === opt.id && 'settings-option-card--selected')}
              onClick={() => onSettingsChange({ default_permission_mode: opt.id })}
            >
              <div className="settings-option-card-label">{opt.label}</div>
              <div className="settings-option-card-desc">{opt.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* 预算上限 */}
      <section className="settings-section">
        <h3 className="settings-section-title">
          <Coins size={15} />
          花费上限
        </h3>
        <p className="settings-section-desc">
          限制单次会话的最大花费（美元）。留空表示不限制。
        </p>
        <div className="modal-field">
          <label>最大花费 (USD)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.5"
            value={maxBudget}
            onChange={(e) => onSettingsChange({ max_budget_usd: e.target.value })}
            placeholder="不限制"
          />
        </div>
      </section>

      {/* 轮次上限 */}
      <section className="settings-section">
        <h3 className="settings-section-title">
          <Repeat size={15} />
          轮次上限
        </h3>
        <p className="settings-section-desc">
          限制单次会话的最大轮次。留空表示不限制。
        </p>
        <div className="modal-field">
          <label>最大轮次</label>
          <input
            className="input"
            type="number"
            min="0"
            step="1"
            value={maxTurns}
            onChange={(e) => onSettingsChange({ max_turns: e.target.value })}
            placeholder="不限制"
          />
        </div>
      </section>
    </div>
  );
}
