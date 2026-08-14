/**
 * SettingsPage — 设置页面（Tab 布局）。
 *
 * 四个 Tab：模型 / 外观 / Agent / 技能。
 * 模型 Tab 提供多供应商管理（添加/启用/删除 + 每供应商模型配置）。
 * 外观 Tab 提供主题切换 + 流式展示开关。
 * Agent Tab 提供交互行为、权限模式、预算/轮次上限。
 * 技能 Tab 展示技能卡片列表 + 开关。
 *
 * 设置采用 KV 结构（settingsApi），前端读取后统一管理。
 * 敏感字段（api_key）仅保存在本地 SQLite。
 */

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router';
import { Save, Check, Sliders, Palette, Bot, Sparkles, Plus, Trash2, Power, ArrowLeft, Pencil } from 'lucide-react';
import { clsx } from 'clsx';

import { settingsApi, providersApi, providerConfigsApi, providerModelsApi } from '@/lib/api';
import type { ProviderInfo, ProviderConfig } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { ModelPicker } from '@/components/ModelPicker';
import { SettingsAppearanceTab } from './SettingsAppearanceTab';
import { SettingsAgentTab } from './SettingsAgentTab';
import { SettingsSkillsTab } from './SettingsSkillsTab';
import './SettingsPage.css';

type TabId = 'model' | 'appearance' | 'agent' | 'skills';

const TABS: { id: TabId; label: string; icon: typeof Sliders }[] = [
  { id: 'model', label: '模型', icon: Sliders },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'skills', label: '技能', icon: Sparkles },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState<Settings>({});
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('model');

  // 记录从哪个页面进入设置，提供返回按钮
  const fromPage = (location.state as { from?: string } | null)?.from;

  const handleBack = () => {
    if (fromPage && fromPage !== '/settings') {
      navigate(fromPage);
    } else {
      navigate('/');
    }
  };

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: providersApi.list });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const handleSave = () => {
    settingsApi.update(form).then(() => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  // 子 Tab 通过此回调更新 form 状态（受控），由顶部保存按钮统一持久化
  const handleSettingsChange = (patch: Partial<Settings>) => {
    setForm((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) {
          delete next[k];
        } else {
          next[k] = v;
        }
      }
      return next;
    });
  };

  return (
    <div className="entity-page settings-page">
      <header className="entity-header">
        <div className="settings-header-left">
          <button className="btn-icon settings-back-btn" onClick={handleBack} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1>设置</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? <><Check size={16} /> 已保存</> : <><Save size={16} /> 保存</>}
        </button>
      </header>

      <div className="settings-layout">
        {/* 左侧 Tab 导航 */}
        <nav className="settings-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={clsx('settings-tab', activeTab === tab.id && 'settings-tab--active')}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 右侧内容区 */}
        <div className="settings-content">
          {activeTab === 'model' && (
            <SettingsModelTab
              providers={providers}
            />
          )}
          {activeTab === 'appearance' && (
            <SettingsAppearanceTab settings={form} onSettingsChange={handleSettingsChange} />
          )}
          {activeTab === 'agent' && (
            <SettingsAgentTab settings={form} onSettingsChange={handleSettingsChange} />
          )}
          {activeTab === 'skills' && <SettingsSkillsTab />}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 模型 Tab — 多供应商管理（卡片式展示，弹窗添加/编辑）
// ============================================================

/** 掩码显示 API Key（本地应用不做脱敏存储，仅界面展示）。 */
function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••${key.slice(-4)}`;
}

function SettingsModelTab({
  providers,
}: {
  providers: ProviderInfo[];
}) {
  const queryClient = useQueryClient();
  const { data: pcData } = useQuery({
    queryKey: ['provider-configs'],
    queryFn: providerConfigsApi.list,
  });
  const configs = pcData?.configs ?? [];
  const activeProvider = pcData?.activeProvider;

  const [modal, setModal] = useState<{ open: boolean; editing: ProviderConfig | null }>({
    open: false,
    editing: null,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['provider-configs'] });
  const kindLabel = (kind: string) => providers.find((p) => p.id === kind)?.label ?? kind;

  const handleRemove = (id: string) => {
    if (!window.confirm('确定删除该供应商配置？')) return;
    providerConfigsApi.remove(id).then(invalidate);
  };

  const handleModelChange = (id: string, model: string) => {
    providerConfigsApi.update(id, { model }).then(invalidate);
  };

  const handleSaved = () => {
    invalidate();
    setModal({ open: false, editing: null });
  };

  return (
    <div className="settings-tab-content">
      <div className="card settings-model-card">
        {/* 工具栏：说明 + 添加按钮 */}
        <div className="provider-toolbar">
          <p className="settings-section-desc">
            支持添加多个 AI 供应商（官方 API / 中转站 / Bedrock 等），想用哪个直接启用。凭据仅保存在本地。
          </p>
          <button className="btn btn-primary" onClick={() => setModal({ open: true, editing: null })}>
            <Plus size={14} /> 添加供应商
          </button>
        </div>

        {/* 供应商卡片 */}
        {configs.length === 0 ? (
          <div className="provider-list-empty">
            还没有供应商配置，点击右上角「添加供应商」创建第一个。
          </div>
        ) : (
          <div className="provider-grid">
            {configs.map((c) => (
              <div key={c.id} className={clsx('provider-card', !c.enabled && 'provider-card--disabled')}>
                <div className="provider-card-header">
                  <div className="provider-card-title">
                    <span className="provider-card-name">{c.name}</span>
                    {activeProvider === c.id && c.enabled && (
                      <span className="provider-item-active">当前使用</span>
                    )}
                    <span className="provider-kind-badge">{kindLabel(c.kind)}</span>
                  </div>
                  <div className="provider-card-actions">
                    <button
                      className={clsx('provider-toggle', c.enabled && 'provider-toggle--on')}
                      onClick={() => {
                        if (c.enabled) providerConfigsApi.disable(c.id).then(invalidate);
                        else providerConfigsApi.enable(c.id).then(invalidate);
                      }}
                      title={c.enabled ? '停用' : '启用'}
                    >
                      <Power size={14} />
                    </button>
                    <button
                      className="provider-edit"
                      onClick={() => setModal({ open: true, editing: c })}
                      title="编辑"
                    >
                      <Pencil size={14} />
                    </button>
                    <button className="provider-delete" onClick={() => handleRemove(c.id)} title="删除">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="provider-card-body">
                  <div className="provider-card-row">
                    <span className="provider-card-label">模型</span>
                    <ModelPicker
                      value={c.model ?? ''}
                      onChange={(m) => handleModelChange(c.id, m)}
                      onFetchLive={() => providerModelsApi.fetch(c.id)}
                      compact
                      placeholder="选择或输入模型 ID"
                    />
                  </div>
                  {c.baseUrl && (
                    <div className="provider-card-row">
                      <span className="provider-card-label">Base URL</span>
                      <span className="provider-card-value">{c.baseUrl}</span>
                    </div>
                  )}
                  {c.apiKey && (
                    <div className="provider-card-row">
                      <span className="provider-card-label">API Key</span>
                      <span className="provider-card-value">{maskKey(c.apiKey)}</span>
                    </div>
                  )}
                  {!c.apiKey && !c.baseUrl && (
                    <div className="provider-card-row">
                      <span className="provider-card-value provider-card-value--dim">
                        无凭据配置（使用本机认证）
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加 / 编辑弹窗 */}
      {modal.open && (
        <ProviderModal
          providers={providers}
          editing={modal.editing}
          onClose={() => setModal({ open: false, editing: null })}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ============================================================
// 供应商添加/编辑弹窗
// ============================================================

function ProviderModal({
  providers,
  editing,
  onClose,
  onSaved,
}: {
  providers: ProviderInfo[];
  editing: ProviderConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [draft, setDraft] = useState({
    name: editing?.name ?? '',
    kind: editing?.kind ?? 'anthropic',
    // 编辑时 API Key 留空表示不修改
    apiKey: '',
    baseUrl: editing?.baseUrl ?? '',
    model: editing?.model ?? '',
  });
  const draftDef = providers.find((p) => p.id === draft.kind);

  const keyRequired = !!draftDef?.needsApiKey;
  // 编辑且原配置已有 key、输入框留空时视为不修改
  const hasKey = isEdit && !!editing?.apiKey && draft.apiKey.trim() === ''
    ? true
    : draft.apiKey.trim() !== '';
  const canSave = !!draft.kind && (!keyRequired || hasKey);

  const handleSave = () => {
    const payload = {
      name: draft.name.trim() || undefined,
      kind: draft.kind,
      // 空字符串 → 后端按 undefined 处理（编辑时不修改 / 添加时不设置）
      apiKey: draft.apiKey.trim() || undefined,
      baseUrl: draft.baseUrl.trim() || undefined,
      model: draft.model.trim() || undefined,
    };
    const action = isEdit
      ? providerConfigsApi.update(editing!.id, payload)
      : providerConfigsApi.create(payload);
    action.then(onSaved);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? '编辑供应商' : '添加供应商'}</h2>

        <div className="modal-field">
          <label>名称</label>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="如：我的 Anthropic / 中转站 A"
          />
        </div>

        <div className="modal-field">
          <label>类型</label>
          <select
            className="input"
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {draftDef?.needsApiKey && (
          <div className="modal-field">
            <label>API Key{isEdit && editing?.apiKey ? '（留空表示不修改）' : ''}</label>
            <input
              className="input"
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-ant-..."
            />
          </div>
        )}

        {draftDef?.needsBaseUrl && (
          <div className="modal-field">
            <label>Base URL</label>
            <input
              className="input"
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder="https://api.anthropic.com"
            />
          </div>
        )}

        <div className="modal-field">
          <label>模型 ID（可留空，添加后在卡片上点击模型下拉从该供应商获取）</label>
          <input
            className="input"
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            placeholder="如：claude-sonnet-4-20250514"
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        {draftDef && <p className="settings-provider-note">{draftDef.description}</p>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            {isEdit ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 下拉选择器（与 composer 下拉风格一致，使用 portal 渲染）
// ============================================================

