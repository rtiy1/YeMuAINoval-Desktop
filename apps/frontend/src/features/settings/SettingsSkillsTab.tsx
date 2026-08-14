/**
 * 技能设置 Tab — 技能卡片列表 + 开关。
 *
 * 按 category 分组展示。受限技能（restricted）显示锁定徽章。
 * 开关状态持久化到后端 settings（skills.enabled 键）。
 * 按设计决策：仅持久化，不注入 MCode 系统提示。
 */

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Lock, BookOpen, Brain, Bug, Cog, Code } from 'lucide-react';
import { clsx } from 'clsx';

import { skillsApi } from '@/lib/api';
import type { SkillInfo, SkillCategory } from '@/lib/types';

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  writing: '写作',
  memory: '记忆',
  debugging: '调试',
  system: '系统',
  code: '代码',
};

const CATEGORY_ICONS: Record<SkillCategory, typeof Sparkles> = {
  writing: BookOpen,
  memory: Brain,
  debugging: Bug,
  system: Cog,
  code: Code,
};

const CATEGORY_ORDER: SkillCategory[] = ['writing', 'memory', 'system', 'debugging', 'code'];

export function SettingsSkillsTab() {
  const queryClient = useQueryClient();

  const { data: skills = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: skillsApi.list,
  });

  const { data: enabled = [] } = useQuery({
    queryKey: ['skills-enabled'],
    queryFn: skillsApi.getEnabled,
  });

  const [optimisticEnabled, setOptimisticEnabled] = useState<string[] | null>(null);
  const currentEnabled = optimisticEnabled ?? enabled;

  const grouped = useMemo(() => {
    const map = new Map<SkillCategory, SkillInfo[]>();
    for (const skill of skills) {
      const list = map.get(skill.category) ?? [];
      list.push(skill);
      map.set(skill.category, list);
    }
    return CATEGORY_ORDER
      .filter((cat) => map.has(cat))
      .map((cat) => ({ category: cat, skills: map.get(cat)! }));
  }, [skills]);

  const handleToggle = (name: string, turnOn: boolean) => {
    const next = turnOn
      ? [...currentEnabled, name]
      : currentEnabled.filter((n) => n !== name);
    setOptimisticEnabled(next);
    skillsApi.setEnabled(next).then(() => {
      queryClient.invalidateQueries({ queryKey: ['skills-enabled'] });
      setOptimisticEnabled(null);
    });
  };

  if (skills.length === 0) {
    return (
      <div className="empty-state">
        <Sparkles size={32} className="empty-state-icon" />
        <p>暂无可用技能</p>
      </div>
    );
  }

  return (
    <div className="settings-tab-content">
      <section className="settings-section">
        <h3 className="settings-section-title">
          <Sparkles size={15} />
          技能管理
        </h3>
        <p className="settings-section-desc">
          启用或禁用技能。开关状态保存在本地，不影响 Agent 实际行为。
          在对话框输入 <code className="settings-code">/技能名</code> 可调用对应技能。
        </p>

        {grouped.map(({ category, skills: catSkills }) => {
          const Icon = CATEGORY_ICONS[category];
          return (
            <div key={category} className="skill-group">
              <div className="skill-group-header">
                <Icon size={14} />
                <span>{CATEGORY_LABELS[category]}</span>
                <span className="skill-group-count">{catSkills.length}</span>
              </div>
              <div className="skill-cards">
                {catSkills.map((skill) => {
                  const isEnabled = currentEnabled.includes(skill.name);
                  return (
                    <div
                      key={skill.name}
                      className={clsx('skill-card', isEnabled && 'skill-card--enabled')}
                    >
                      <div className="skill-card-main">
                        <div className="skill-card-name-row">
                          <span className="skill-card-name">/{skill.name}</span>
                          {skill.restricted && (
                            <span className="skill-card-badge skill-card-badge--restricted" title="此技能在 MCode 中受 ant/feature 限制，外部用户可能不可用">
                              <Lock size={11} />
                              受限
                            </span>
                          )}
                          {skill.source === 'custom' && (
                            <span className="skill-card-badge skill-card-badge--custom">
                              写作模板
                            </span>
                          )}
                          {!skill.userInvocable && (
                            <span className="skill-card-badge skill-card-badge--auto">
                              自动触发
                            </span>
                          )}
                        </div>
                        <p className="skill-card-desc">{skill.description}</p>
                        {skill.argumentHint && (
                          <p className="skill-card-hint">参数：{skill.argumentHint}</p>
                        )}
                      </div>
                      <button
                        className={clsx('settings-toggle', isEnabled && 'settings-toggle--on')}
                        onClick={() => handleToggle(skill.name, !isEnabled)}
                        role="switch"
                        aria-checked={isEnabled}
                        disabled={!skill.userInvocable && !isEnabled}
                        title={
                          !skill.userInvocable && !isEnabled
                            ? '此技能仅模型自动触发，无法手动启用'
                            : undefined
                        }
                      >
                        <span className="settings-toggle-thumb" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
