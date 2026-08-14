/**
 * WorldInfoPage — 世界观条目卡片式 CRUD。
 */

import { useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2, Plus, Trash2, X } from 'lucide-react';

import { worldInfoApi } from '@/lib/api';
import type { WorldInfoEntry } from '@/lib/types';
import '../characters/CharactersPage.css';

export function WorldInfoPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<WorldInfoEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['world-info', projectId],
    queryFn: () => worldInfoApi.list(projectId!),
    enabled: !!projectId,
  });

  const deleteMutation = useMutation({
    mutationFn: worldInfoApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['world-info', projectId] }),
  });

  return (
    <div className="entity-page">
      <header className="entity-header">
        <h1>世界观设定</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> 新建条目
        </button>
      </header>

      {isLoading ? (
        <div className="empty-state loading">加载中…</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <Globe2 size={48} className="empty-state-icon" />
          <p>还没有世界观设定</p>
          <span>添加地点、组织、物品、规则等设定，让 AI 保持世界观一致。</span>
        </div>
      ) : (
        <div className="entity-grid">
          {entries.map((entry) => (
            <div key={entry.id} className="card entity-card" onClick={() => setEditing(entry)}>
              <div className="entity-card-body">
                <h3>{entry.title}</h3>
                {entry.category && <span className="entity-badge">{entry.category}</span>}
                <p className="entity-desc">{entry.content}</p>
              </div>
              <button
                className="btn-icon entity-card-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`确定删除「${entry.title}」？`)) deleteMutation.mutate(entry.id);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editing) && (
        <WorldInfoEditor
          projectId={projectId!}
          entry={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function WorldInfoEditor({
  projectId,
  entry,
  onClose,
}: {
  projectId: string;
  entry: WorldInfoEntry | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: entry?.title ?? '',
    category: entry?.category ?? '',
    content: entry?.content ?? '',
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (entry) {
        return worldInfoApi.update(entry.id, form);
      }
      return worldInfoApi.create(projectId, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['world-info', projectId] });
      onClose();
    },
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{entry ? '编辑条目' : '新建条目'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-field">
          <label>标题</label>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="例：雪城"
            autoFocus
          />
        </div>
        <div className="modal-field">
          <label>分类（地点/组织/物品/规则…）</label>
          <input
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="例：地点"
          />
        </div>
        <div className="modal-field">
          <label>内容</label>
          <textarea
            className="input"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={8}
            placeholder="详细描述这个设定…"
          />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            disabled={!form.title.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
