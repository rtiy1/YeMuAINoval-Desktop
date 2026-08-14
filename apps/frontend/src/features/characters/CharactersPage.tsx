/**
 * CharactersPage — 角色档案卡片式 CRUD。
 */

import { useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, X } from 'lucide-react';

import { charactersApi } from '@/lib/api';
import type { Character } from '@/lib/types';
import './CharactersPage.css';

export function CharactersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Character | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ['characters', projectId],
    queryFn: () => charactersApi.list(projectId!),
    enabled: !!projectId,
  });

  const deleteMutation = useMutation({
    mutationFn: charactersApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['characters', projectId] }),
  });

  return (
    <div className="entity-page">
      <header className="entity-header">
        <h1>角色档案</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <UserPlus size={16} /> 新建角色
        </button>
      </header>

      {isLoading ? (
        <div className="empty-state loading">加载中…</div>
      ) : characters.length === 0 ? (
        <div className="empty-state">
          <UserPlus size={48} className="empty-state-icon" />
          <p>还没有角色档案</p>
          <span>创建角色，让 AI 在写作时保持人物一致性。</span>
        </div>
      ) : (
        <div className="entity-grid">
          {characters.map((char) => (
            <div key={char.id} className="card entity-card" onClick={() => setEditing(char)}>
              <div className="character-avatar">
                {char.name.charAt(0)}
              </div>
              <div className="entity-card-body">
                <h3>{char.name}</h3>
                {char.role && <span className="entity-badge">{char.role}</span>}
                {char.profile && <p className="entity-desc">{char.profile}</p>}
              </div>
              <button
                className="btn-icon entity-card-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`确定删除角色「${char.name}」？`)) deleteMutation.mutate(char.id);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editing) && (
        <CharacterEditor
          projectId={projectId!}
          character={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CharacterEditor({
  projectId,
  character,
  onClose,
}: {
  projectId: string;
  character: Character | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: character?.name ?? '',
    role: character?.role ?? '',
    profile: character?.profile ?? '',
    appearance: character?.appearance ?? '',
    personality: character?.personality ?? '',
    backstory: character?.backstory ?? '',
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (character) {
        return charactersApi.update(character.id, form);
      }
      return charactersApi.create(projectId, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', projectId] });
      onClose();
    },
  });

  const fields: { key: keyof typeof form; label: string; multiline?: boolean }[] = [
    { key: 'name', label: '姓名' },
    { key: 'role', label: '角色定位（主角/配角/反派…）' },
    { key: 'profile', label: '简介', multiline: true },
    { key: 'appearance', label: '外貌', multiline: true },
    { key: 'personality', label: '性格', multiline: true },
    { key: 'backstory', label: '背景故事', multiline: true },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{character ? '编辑角色' : '新建角色'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        {fields.map((field) => (
          <div key={field.key} className="modal-field">
            <label>{field.label}</label>
            {field.multiline ? (
              <textarea
                className="input"
                value={form[field.key]}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                rows={3}
              />
            ) : (
              <input
                className="input"
                value={form[field.key]}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              />
            )}
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
