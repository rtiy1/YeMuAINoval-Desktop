/**
 * ProjectsPage — 项目列表与新建。
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookPlus, FileText, Trash2 } from 'lucide-react';

import { projectsApi } from '@/lib/api';
import type { Project } from '@/lib/types';
import './ProjectsPage.css';

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  const createMutation = useMutation({
    mutationFn: () => projectsApi.create(title.trim(), description.trim() || undefined),
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setTitle('');
      setDescription('');
      navigate(`/project/${project.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: projectsApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  return (
    <div className="projects-page">
      <header className="projects-header">
        <h1 className="projects-title">夜幕 · AI 小说工作台</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <BookPlus size={16} /> 新建小说
        </button>
      </header>

      {isLoading ? (
        <div className="empty-state loading">加载中…</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} className="empty-state-icon" />
          <h2>开始你的第一部小说</h2>
          <p>创建项目，让 AI 协助你构建世界观、设计角色、书写故事。</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <BookPlus size={16} /> 新建小说
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <div
              key={project.id}
              className="card project-card"
              onClick={() => navigate(`/project/${project.id}`)}
            >
              <div className="project-card-cover">
                <FileText size={32} />
              </div>
              <div className="project-card-body">
                <h3 className="project-card-title">{project.title}</h3>
                {project.description && (
                  <p className="project-card-desc">{project.description}</p>
                )}
                <div className="project-card-meta">
                  <span>{project.chapterCount} 章</span>
                  <span>{project.wordCount} 字</span>
                </div>
              </div>
              <button
                className="btn-icon project-card-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`确定删除《${project.title}》？所有章节与设定将一并删除。`)) {
                    deleteMutation.mutate(project.id);
                  }
                }}
                title="删除项目"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>新建小说</h2>
            <div className="modal-field">
              <label>标题</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入小说标题"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && title.trim()) createMutation.mutate();
                }}
              />
            </div>
            <div className="modal-field">
              <label>简介（可选）</label>
              <textarea
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="一句话描述这个故事"
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowCreate(false)}>取消</button>
              <button
                className="btn btn-primary"
                disabled={!title.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
