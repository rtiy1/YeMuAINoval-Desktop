/**
 * WritingPage — 沉浸式写作工作台。
 *
 * 左侧卷/章节树，中央 TipTap 编辑器（沉浸居中），自动保存。
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FilePlus, ChevronDown, ChevronRight, Book, Users, Globe } from 'lucide-react';
import { clsx } from 'clsx';

import { chaptersApi, projectsApi, volumesApi } from '@/lib/api';
import type { Chapter, ChapterListItem, Volume } from '@/lib/types';
import { useAppStore } from '@/stores/app-store';
import './WritingPage.css';

export function WritingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeChapterId, setActiveChapter } = useAppStore();
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  });

  const { data: volumes = [] } = useQuery({
    queryKey: ['volumes', projectId],
    queryFn: () => volumesApi.list(projectId!),
    enabled: !!projectId,
  });

  // 首次加载时展开所有卷
  useEffect(() => {
    if (volumes.length > 0 && expandedVolumes.size === 0) {
      setExpandedVolumes(new Set(volumes.map((v) => v.id)));
    }
  }, [volumes, expandedVolumes.size]);

  return (
    <div className="writing-page">
      {/* 章节树侧栏 */}
      <div className="writing-sidebar">
        <div className="writing-sidebar-header">
          <span className="writing-project-title">{project?.title ?? '...'}</span>
        </div>
        <div className="writing-tree">
          {volumes.map((volume) => (
            <VolumeNode
              key={volume.id}
              volume={volume}
              projectId={projectId!}
              expanded={expandedVolumes.has(volume.id)}
              onToggle={() => {
                const next = new Set(expandedVolumes);
                if (next.has(volume.id)) next.delete(volume.id);
                else next.add(volume.id);
                setExpandedVolumes(next);
              }}
              activeChapterId={activeChapterId}
              onSelectChapter={setActiveChapter}
            />
          ))}
        </div>

        {/* 快捷入口：角色 / 世界观 */}
        <div className="writing-sidebar-section">
          <button
            className="writing-sidebar-link"
            onClick={() => navigate(`/project/${projectId}/characters`)}
          >
            <Users size={15} />
            <span>角色档案</span>
          </button>
          <button
            className="writing-sidebar-link"
            onClick={() => navigate(`/project/${projectId}/world-info`)}
          >
            <Globe size={15} />
            <span>世界观设定</span>
          </button>
        </div>
      </div>

      {/* 编辑器 */}
      <div className="editor-container">
        {activeChapterId ? (
          <ChapterEditor key={activeChapterId} chapterId={activeChapterId} />
        ) : (
          <div className="empty-state">
            <Book size={48} className="empty-state-icon" />
            <h2>选择或创建一个章节开始写作</h2>
            <p>在左侧选择章节，或点击 + 新建章节。</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** 卷节点（含章节列表）。 */
function VolumeNode({
  volume,
  projectId,
  expanded,
  onToggle,
  activeChapterId,
  onSelectChapter,
}: {
  volume: Volume;
  projectId: string;
  expanded: boolean;
  onToggle: () => void;
  activeChapterId: string | null;
  onSelectChapter: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: chapters = [] } = useQuery({
    queryKey: ['chapters', volume.id],
    queryFn: () => chaptersApi.list(volume.id),
  });

  const createChapter = useMutation({
    mutationFn: () => chaptersApi.create(volume.id, `第 ${chapters.length + 1} 章`),
    onSuccess: (chapter: Chapter) => {
      queryClient.invalidateQueries({ queryKey: ['chapters', volume.id] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      onSelectChapter(chapter.id);
    },
  });

  return (
    <div className="volume-node">
      <button className="volume-header" onClick={onToggle}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="volume-title">{volume.title}</span>
        <span className="volume-count">{chapters.length}</span>
      </button>
      {expanded && (
        <div className="chapter-list">
          {chapters.map((chapter: ChapterListItem) => (
            <button
              key={chapter.id}
              className={clsx(
                'chapter-item',
                activeChapterId === chapter.id && 'chapter-item--active',
              )}
              onClick={() => onSelectChapter(chapter.id)}
            >
              <span className="chapter-item-title">{chapter.title}</span>
              <span className="chapter-item-words">{chapter.wordCount}字</span>
            </button>
          ))}
          <button
            className="chapter-add"
            onClick={() => createChapter.mutate()}
            disabled={createChapter.isPending}
          >
            <FilePlus size={14} /> 新建章节
          </button>
        </div>
      )}
    </div>
  );
}

/** 章节编辑器 — TipTap + 自动保存。 */
function ChapterEditor({ chapterId }: { chapterId: string }) {
  const queryClient = useQueryClient();
  const { projectId } = useParams<{ projectId: string }>();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const { data: chapter } = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => chaptersApi.get(chapterId),
  });

  const saveMutation = useMutation({
    mutationFn: (content: string) => chaptersApi.update(chapterId, { content }),
    onMutate: () => setSaveStatus('saving'),
    onSuccess: () => {
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['chapters'] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setTimeout(() => setSaveStatus('idle'), 1500);
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'ProseMirror',
        'data-placeholder': '开始书写这一章…',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveMutation.mutate(html);
      }, 1200);
    },
  });

  // 章节加载后注入内容
  useEffect(() => {
    if (editor && chapter) {
      editor.commands.setContent(chapter.content || '<p></p>', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);

  if (!chapter) {
    return <div className="empty-state loading">加载章节…</div>;
  }

  const wordCount = chapter.wordCount;

  return (
    <>
      <div className="editor-toolbar">
        <input
          className="editor-title-input"
          defaultValue={chapter.title}
          onBlur={(e) => {
            const newTitle = e.target.value.trim();
            if (newTitle && newTitle !== chapter.title) {
              chaptersApi.update(chapterId, { title: newTitle });
              queryClient.invalidateQueries({ queryKey: ['chapter', chapterId] });
              queryClient.invalidateQueries({ queryKey: ['chapters', chapter.volumeId] });
            }
          }}
          placeholder="章节标题"
        />
        <span className={clsx('editor-save-status', `editor-save-status--${saveStatus}`)}>
          {saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存' : `${wordCount} 字`}
        </span>
      </div>
      <div className="editor-scroll">
        <div className="editor-content">
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}
