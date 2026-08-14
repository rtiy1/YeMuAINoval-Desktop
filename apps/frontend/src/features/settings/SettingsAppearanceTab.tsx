/**
 * 外观设置 Tab — 主题选择 + 流式展示开关。
 *
 * 主题通过 theme-store 持久化到 localStorage，立即生效。
 * 流式展示开关持久化到后端 settings KV。
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Eye, MessageSquare, ListTodo } from 'lucide-react';
import { clsx } from 'clsx';

import { settingsApi } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { THEME_OPTIONS, useThemeStore, type ThemeId } from '@/stores/theme-store';

interface AppearanceTabProps {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
}

export function SettingsAppearanceTab({ settings, onSettingsChange }: AppearanceTabProps) {
  const { theme, setTheme } = useThemeStore();
  const queryClient = useQueryClient();

  // 主题选择：同时更新 localStorage（theme-store）和后端 settings（后端感知）
  const handleThemeSelect = (id: ThemeId) => {
    setTheme(id);
    onSettingsChange({ theme: id });
  };

  const showReasoning = settings.show_reasoning === 'true';
  const showTodos = settings.show_todos === 'true';

  const handleToggle = (key: 'show_reasoning' | 'show_todos', value: boolean) => {
    const patch: Partial<Settings> = { [key]: String(value) };
    onSettingsChange(patch);
  };

  return (
    <div className="settings-tab-content">
      {/* 主题选择 */}
      <section className="settings-section">
        <h3 className="settings-section-title">
          <Eye size={15} />
          主题
        </h3>
        <p className="settings-section-desc">
          选择配色方案，立即生效。
        </p>
        <div className="theme-cards">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={clsx('theme-card', theme === opt.id && 'theme-card--selected')}
              onClick={() => handleThemeSelect(opt.id)}
              data-theme-preview={opt.id}
            >
              <span className="theme-card-swatches">
                <span className="theme-card-swatch theme-card-swatch--bg" />
                <span className="theme-card-swatch theme-card-swatch--accent" />
                <span className="theme-card-swatch theme-card-swatch--text" />
              </span>
              <span className="theme-card-label">{opt.label}</span>
              <span className="theme-card-desc">{opt.description}</span>
              {theme === opt.id && (
                <span className="theme-card-check">
                  <Check size={14} />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* 流式展示 */}
      <section className="settings-section">
        <h3 className="settings-section-title">
          <MessageSquare size={15} />
          流式展示
        </h3>
        <p className="settings-section-desc">
          控制 Agent 对话面板中显示的内容。
        </p>
        <div className="settings-toggles">
          <ToggleRow
            icon={<ListTodo size={15} />}
            label="显示推理过程"
            description="在助手回复中展示思考步骤"
            checked={showReasoning}
            onChange={(v) => handleToggle('show_reasoning', v)}
          />
          <ToggleRow
            icon={<ListTodo size={15} />}
            label="显示任务列表"
            description="在助手回复中展示 Todo 进度"
            checked={showTodos}
            onChange={(v) => handleToggle('show_todos', v)}
          />
        </div>
      </section>
    </div>
  );
}

// ---- 通用开关行 ----

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-toggle-info">
        <span className="settings-toggle-icon">{icon}</span>
        <div>
          <div className="settings-toggle-label">{label}</div>
          {description && <div className="settings-toggle-desc">{description}</div>}
        </div>
      </div>
      <button
        className={clsx('settings-toggle', checked && 'settings-toggle--on')}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span className="settings-toggle-thumb" />
      </button>
    </div>
  );
}
