/**
 * ModelPicker — 模型下拉选择器（AI 面板与设置页共用）。
 *
 * 点击按钮弹出浮层：
 * - 打开时自动从供应商的真实 API 获取模型列表（onFetchLive）
 * - 获取失败 / 未配置供应商时显示错误提示，可手动填写模型 ID
 * - 右上角刷新按钮重新获取
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Cpu, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

import './ModelPicker.css';

export interface ModelPickerModel {
  id: string;
  label?: string;
  description?: string;
}

export interface LiveFetchResult {
  models: ModelPickerModel[];
  error?: string;
  providerName?: string;
}

export function ModelPicker({
  value,
  onChange,
  onFetchLive,
  compact = false,
  placeholder = '选择或输入模型 ID',
}: {
  value: string;
  onChange: (id: string) => void;
  /** 从供应商真实 API 获取模型列表（打开时自动调用，刷新按钮调用）。 */
  onFetchLive: () => Promise<LiveFetchResult>;
  /** 紧凑模式：用于 AI 面板工具栏等窄空间。 */
  compact?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<LiveFetchResult | null>(null);
  const [fetchingLive, setFetchingLive] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const runFetchLive = useCallback(() => {
    setFetchingLive(true);
    onFetchLive()
      .then((res) => setLive(res))
      .catch(() => setLive({ models: [], error: '获取模型失败，请检查网络与供应商配置' }))
      .finally(() => setFetchingLive(false));
  }, [onFetchLive]);

  // 打开浮层时自动获取一次真实模型列表
  useEffect(() => {
    if (open && !live && !fetchingLive) {
      runFetchLive();
    }
  }, [open, live, fetchingLive, runFetchLive]);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    // 下方空间不足时向上弹出（如 AI 面板底部的 composer）
    const estHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const up = spaceBelow < estHeight && rect.top > spaceBelow;
    setOpenUp(up);
    setPos({ top: up ? Math.max(8, rect.top - 4) : rect.bottom + 4, left: rect.left });
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        const dd = document.getElementById('model-picker-floating');
        if (!dd || !dd.contains(e.target as Node)) setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const submit = (id: string) => {
    const trimmed = id.trim();
    if (trimmed) onChange(trimmed);
    setOpen(false);
  };

  const models = live?.models ?? [];
  const hasError = !!live?.error;
  const current = models.find((m) => m.id === value);
  const display = current?.label ?? value;

  return (
    <div className="model-picker">
      <button
        ref={btnRef}
        className={clsx(
          'model-picker-trigger',
          compact && 'model-picker-trigger--compact',
          open && 'model-picker-trigger--open',
        )}
        onClick={() => setOpen((v) => !v)}
        title="选择模型（可自定义输入模型 ID）"
      >
        <Cpu size={14} className="model-picker-icon" />
        <span className={clsx('model-picker-value', !value && 'model-picker-value--empty')}>
          {value ? display : placeholder}
        </span>
        <ChevronDown size={12} className="model-picker-caret" />
      </button>
      {open && createPortal(
        <div
          id="model-picker-floating"
          className="model-picker-popover"
          style={{ top: pos.top, left: pos.left, minWidth: 300, ...(openUp ? { transform: 'translateY(-100%)' } : {}) }}
        >
          <div className="model-picker-header">
            <span>
              可用模型（{models.length}）
              {live?.providerName ? ` · ${live.providerName}` : ''}
            </span>
            <button
              className="model-picker-refetch"
              onClick={(e) => { e.stopPropagation(); runFetchLive(); }}
              title="获取模型列表"
            >
              <RefreshCw size={12} className={clsx(fetchingLive && 'model-picker-refetch--spin')} />
            </button>
          </div>
          {hasError && (
            <div className="model-picker-error">{live?.error}</div>
          )}
          <div className="model-picker-list">
            {fetchingLive && models.length === 0 ? (
              <div className="model-picker-empty">正在从供应商获取模型…</div>
            ) : models.length === 0 ? (
              <div className="model-picker-empty">
                {hasError
                  ? '可在下方输入框直接填写模型 ID'
                  : '暂无模型，点击右上角刷新获取'}
              </div>
            ) : (
              models.map((m) => (
                <button
                  key={m.id}
                  className={clsx('model-picker-option', value === m.id && 'model-picker-option--selected')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => submit(m.id)}
                >
                  <span className="model-picker-option-id">{m.id}</span>
                  {m.label && m.label !== m.id && (
                    <span className="model-picker-option-label">{m.label}</span>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="model-picker-custom">
            <input
              className="input model-picker-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submit(draft); }
              }}
              placeholder="自定义模型 ID，回车应用…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
