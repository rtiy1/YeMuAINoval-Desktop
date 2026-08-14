/**
 * AssistantPanel — 右侧 Agent 对话面板。
 *
 * 布局完全 的 AI 界面：
 * - 消息流：用户右对齐气泡 / 助手全宽无气泡+头像+turn-footer
 * - 工具调用：可折叠分组徽章
 * - Composer：accent 边框圆角容器
 *   左侧工具栏（provider → model → thinking → mode）+ 右侧发送按钮
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PanelRightClose,
  ArrowUp,
  Square,
  Sparkles,
  Copy,
  Check,
  Wrench,
  ChevronDown,
  Brain,
  Cpu,
  Settings2,
  Bot,
  ListTodo,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { clsx } from 'clsx';

import { agentSocket } from '@/lib/ws';
import { sessionsApi, settingsApi, skillsApi, commandsApi, messagesApi, usageApi, providerConfigsApi, providerModelsApi } from '@/lib/api';
import type { AgentEvent, SkillInfo, CommandInfo, StoredMessage } from '@/lib/types';
import { ModelPicker } from '@/components/ModelPicker';
import { useAppStore } from '@/stores/app-store';
import './AssistantPanel.css';

// ---- 常量 ----

const THINKING_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
] as const;

const MODE_OPTIONS = [
  { id: 'default', label: 'Default', icon: Bot },
  { id: 'plan', label: 'Plan', icon: ListTodo },
  { id: 'accept-edits', label: 'Accept edits', icon: ShieldCheck },
  { id: 'bypass-permissions', label: 'Bypass', icon: ShieldOff },
] as const;

// ---- 类型 ----

interface ToolCall { id: string; name: string; input?: unknown }
interface ToolCallGroup { id: string; toolCalls: ToolCall[]; expanded: boolean }
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  toolCallGroups?: ToolCallGroup[];
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

/** 斜杠菜单可选项（命令或技能）。 */
interface SlashEntry {
  type: 'command' | 'skill';
  name: string;
  label: string;
  description: string;
  argumentHint?: string;
}

// ---- 工具函数 ----

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `耗时 ${s}秒`;
  const m = Math.floor(s / 60);
  return `耗时 ${m}分${s % 60}秒`;
}

function summarizeToolCalls(toolCalls: ToolCall[]): string {
  if (toolCalls.length === 0) return '';
  const counts: Record<string, number> = {};
  for (const tc of toolCalls) {
    const label =
      tc.name === 'Read' ? '读取文件' :
      tc.name === 'Write' || tc.name === 'Edit' ? '编辑文件' :
      tc.name === 'Bash' ? '执行命令' :
      tc.name === 'Search' || tc.name === 'Grep' ? '搜索' : '其他操作';
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, count]) => (count === 1 ? label : `${count}次${label}`))
    .join('、');
}

// ============================================================
// 主组件
// ============================================================

export function AssistantPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { activeChapterId } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [contextUsed, setContextUsed] = useState(0); // 已用 token 数
  const [contextMax] = useState(200000); // 上下文窗口上限
  const [sessionCost, setSessionCost] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentAssistantRef = useRef<ChatMessage | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 控件状态
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514');
  const [selectedThinking, setSelectedThinking] = useState('medium');
  const [selectedMode, setSelectedMode] = useState('default');

  // 斜杠命令菜单状态
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 读取设置
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  // 多供应商配置（当前启用的 provider 决定 API 凭据与默认模型）
  const { data: providerData } = useQuery({
    queryKey: ['provider-configs'],
    queryFn: providerConfigsApi.list,
  });

  useEffect(() => {
    if (settings?.model_name) setSelectedModel(settings.model_name);
  }, [settings?.model_name]);

  // 优先使用当前供应商配置的模型（设置页中每个 provider 可独立配置模型）
  useEffect(() => {
    const activeCfg = providerData?.configs.find(
      (c) => c.id === providerData.activeProvider && c.enabled,
    );
    if (activeCfg?.model) setSelectedModel(activeCfg.model);
  }, [providerData?.activeProvider, providerData?.configs]);

  // 选择模型：写入全局设置 + 当前供应商配置（双写，新会话读取供应商模型）
  const handleModelSelect = (id: string) => {
    setSelectedModel(id);
    settingsApi.update({ model_name: id });
    const activeId = providerData?.activeProvider;
    if (activeId) {
      providerConfigsApi.update(activeId, { model: id }).then(() =>
        queryClient.invalidateQueries({ queryKey: ['provider-configs'] }),
      );
    }
  };

  // 从当前启用的供应商真实 API 获取模型列表
  const fetchLiveModels = () => providerModelsApi.fetch();

  // 斜杠命令 + 技能（Composer 输入 / 时弹出）
  const { data: commands = [] } = useQuery({
    queryKey: ['commands'],
    queryFn: commandsApi.list,
  });
  const { data: skills = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: skillsApi.list,
  });

  // 获取或创建 Agent 会话
  const { data: session } = useQuery({
    queryKey: ['agent-session', projectId],
    queryFn: async () => {
      const sessions = await sessionsApi.list(projectId);
      if (sessions.length > 0) return sessions[0];
      return sessionsApi.create(projectId, '写作助手');
    },
    enabled: !!projectId,
  });

  // 加载历史消息（会话首次加载时恢复）
  const { data: storedMessages } = useQuery({
    queryKey: ['messages', session?.id],
    queryFn: () => messagesApi.list(session!.id),
    enabled: !!session?.id,
  });

  // 加载会话使用量统计（恢复历史花费/轮次）
  const { data: usage } = useQuery({
    queryKey: ['usage', session?.id],
    queryFn: () => usageApi.session(session!.id),
    enabled: !!session?.id,
  });

  // 历史消息恢复（仅首次加载时）
  useEffect(() => {
    if (storedMessages && storedMessages.length > 0) {
      const restored: ChatMessage[] = storedMessages.map((m: StoredMessage) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCallGroups: m.toolCallGroups?.map((g) => ({ ...g, expanded: false })),
        durationMs: m.durationMs,
        completedAt: m.createdAt ? new Date(m.createdAt).getTime() : undefined,
      }));
      setMessages(restored);
    }
  }, [storedMessages]);

  // 历史统计恢复
  useEffect(() => {
    if (usage) {
      setSessionCost(usage.totalCostUsd);
      setContextUsed(usage.totalTurns * 3000);
    }
  }, [usage]);

  // 订阅 WebSocket 事件，携带会话配置（model/effort/thinking/mode）
  useEffect(() => {
    if (!session?.id || !session.mcodeSessionId) return;
    const unsubscribe = agentSocket.on((event: AgentEvent) => {
      if (event.agentSessionId !== session.id) return;
      handleEvent(event);
    });

    // 思考强度 → effort 映射
    const effortMap: Record<string, 'low' | 'medium' | 'high' | 'max'> = {
      none: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'max',
    };
    // 权限模式 → MCode permissionMode 映射
    const modeMap: Record<string, 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'> = {
      default: 'default', plan: 'plan', 'accept-edits': 'acceptEdits', 'bypass-permissions': 'bypassPermissions',
    };
    // thinking 映射
    const thinkingMap: Record<string, 'enabled' | 'adaptive' | 'disabled'> = {
      none: 'disabled', low: 'enabled', medium: 'adaptive', high: 'enabled', xhigh: 'enabled',
    };

    agentSocket.subscribe(session.id, session.mcodeSessionId, {
      model: selectedModel,
      effort: effortMap[selectedThinking] ?? 'medium',
      thinking: thinkingMap[selectedThinking] ?? 'adaptive',
      permissionMode: modeMap[selectedMode] ?? 'default',
      appendSystemPrompt: settings?.writing_style || undefined,
      maxBudgetUsd: 5,
    });
    return unsubscribe;
  }, [session?.id, session?.mcodeSessionId, selectedModel, selectedThinking, selectedMode, settings?.writing_style]);

  const handleEvent = useCallback((event: AgentEvent) => {
    switch (event.kind) {
      case 'text_delta': {
        const payload = event.payload as { text?: string };
        if (!payload?.text) break;
        setMessages((prev) => {
          let assistant = currentAssistantRef.current;
          if (!assistant || !assistant.streaming) {
            assistant = {
              id: `msg-${Date.now()}`, role: 'assistant', content: '', streaming: true,
              toolCallGroups: [], startedAt: Date.now(),
            };
            currentAssistantRef.current = assistant;
            return [...prev, assistant];
          }
          assistant.content += payload.text;
          return [...prev];
        });
        break;
      }
      case 'tool_use': {
        const payload = event.payload as { id?: string; name?: string; input?: unknown };
        const assistant = currentAssistantRef.current;
        if (assistant && payload.name) {
          const groups = assistant.toolCallGroups ?? [];
          let last = groups[groups.length - 1];
          if (!last) { last = { id: `grp-${Date.now()}`, toolCalls: [], expanded: false }; groups.push(last); }
          last.toolCalls.push({ id: payload.id ?? `tc-${Date.now()}`, name: payload.name, input: payload.input });
          assistant.toolCallGroups = [...groups];
          setMessages((prev) => [...prev]);
        }
        break;
      }
      case 'assistant_done':
        if (currentAssistantRef.current) { currentAssistantRef.current.streaming = false; setMessages((p) => [...p]); }
        break;
      case 'result': {
        const payload = event.payload as { isError?: boolean; result?: string; durationMs?: number; costUsd?: number; numTurns?: number };
        if (currentAssistantRef.current) {
          currentAssistantRef.current.streaming = false;
          currentAssistantRef.current.completedAt = Date.now();
          currentAssistantRef.current.durationMs = payload.durationMs;
        }
        currentAssistantRef.current = null;
        setIsGenerating(false);
        if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
        // 更新上下文窗口使用量与花费
        if (payload.numTurns) setContextUsed((prev) => prev + payload.numTurns! * 3000);
        if (payload.costUsd) setSessionCost((prev) => prev + payload.costUsd!);
        if (payload.isError && payload.result) {
          setMessages((p) => [...p, { id: `err-${Date.now()}`, role: 'assistant', content: `⚠️ ${payload.result}` }]);
        }
        // 刷新持久化统计（后端已写入 agent_messages 表）
        queryClient.invalidateQueries({ queryKey: ['usage'] });
        break;
      }
      case 'error': {
        const payload = event.payload as { message?: string };
        setIsGenerating(false);
        currentAssistantRef.current = null;
        if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
        setMessages((p) => [...p, { id: `err-${Date.now()}`, role: 'assistant', content: `⚠️ ${payload.message ?? '未知错误'}` }]);
        break;
      }
      default: break;
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, elapsed]);

  // ---- 斜杠命令菜单 ----
  // 合并命令 + 用户可调用技能，构建统一的可选项列表
  const slashEntries = useMemo(() => {
    const cmdEntries: SlashEntry[] = commands.map((c) => ({
      type: 'command' as const,
      name: c.name,
      label: `/${c.name}`,
      description: c.description,
      argumentHint: c.argumentHint,
    }));
    const skillEntries: SlashEntry[] = skills
      .filter((s) => s.userInvocable)
      .map((s) => ({
        type: 'skill' as const,
        name: s.name,
        label: `/${s.name}`,
        description: s.description,
        argumentHint: s.argumentHint,
      }));
    return [...cmdEntries, ...skillEntries];
  }, [commands, skills]);

  // 根据当前输入过滤斜杠菜单项
  const filteredSlash = useMemo(() => {
    if (!slashMenuOpen) return [];
    // 提取输入中最后一个 / 后的查询词
    const match = input.match(/(?:^|\s)\/(\S*)$/);
    if (!match) return [];
    const query = match[1].toLowerCase();
    if (query === '') return slashEntries.slice(0, 8);
    return slashEntries
      .filter((e) => e.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [input, slashMenuOpen, slashEntries]);

  // 输入变化时检测 / 前缀
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    // 检测 / 前缀（行首或空格后）
    const match = val.match(/(?:^|\s)\/(\S*)$/);
    setSlashMenuOpen(!!match);
    setSlashIndex(0);
  };

  // 选中一个斜杠项：用 /name 替换输入中的 /query 前缀
  const selectSlashEntry = (entry: SlashEntry) => {
    setInput((prev) => {
      const replacement = `/${entry.name} `;
      // 替换最后一个 /xxx 为 /name
      return prev.replace(/(?:^|\s)\/\S*$/, (m) => {
        const prefix = m.startsWith(' ') ? ' ' : '';
        return prefix + replacement;
      });
    });
    setSlashMenuOpen(false);
    setSlashIndex(0);
    textareaRef.current?.focus();
  };

  // 键盘处理：斜杠菜单打开时拦截方向键/Enter/Esc/Tab
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuOpen && filteredSlash.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredSlash.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredSlash.length) % filteredSlash.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSlashEntry(filteredSlash[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }
    // 正常发送
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!input.trim() || !session || isGenerating) return;
    const content = input.trim();
    setInput('');
    setMessages((p) => [...p, { id: `user-${Date.now()}`, role: 'user', content }]);
    setIsGenerating(true);
    setElapsed(0);
    currentAssistantRef.current = null;
    elapsedTimerRef.current = setInterval(() => setElapsed((p) => p + 1000), 1000);
    agentSocket.send({ agentSessionId: session.id, projectId, content, chapterId: activeChapterId });
    queryClient.invalidateQueries({ queryKey: ['agent-session', projectId] });
  };

  const handleInterrupt = () => {
    if (!session) return;
    agentSocket.interrupt(session.id);
    setIsGenerating(false);
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    if (currentAssistantRef.current) {
      currentAssistantRef.current.streaming = false;
      currentAssistantRef.current.content += '\n\n_（已中断）_';
      setMessages((p) => [...p]);
    }
    currentAssistantRef.current = null;
  };

  const toggleToolGroup = (msgId: string, groupId: string) => {
    setMessages((prev) =>
      prev.map((m) => m.id !== msgId || !m.toolCallGroups ? m : {
        ...m,
        toolCallGroups: m.toolCallGroups.map((g) => g.id === groupId ? { ...g, expanded: !g.expanded } : g),
      }),
    );
  };

  return (
    <div className="assistant-panel">
      {/* 头部 */}
      <div className="assistant-header">
        <div className="assistant-title">
          <Sparkles size={15} />
          <span>AI 写作助手</span>
          {isGenerating && <span className="assistant-live-dot" />}
        </div>
        <button className="btn-icon" onClick={onClose} title="收起">
          <PanelRightClose size={18} />
        </button>
      </div>

      {/* 消息流 */}
      <div className="assistant-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="assistant-empty">
            <Sparkles size={32} style={{ opacity: 0.4 }} />
            <p>与 AI 协作创作</p>
            <span>让它帮你续写、发散思路、检查前后文</span>
          </div>
        ) : (
          messages.map((msg) =>
            msg.role === 'user'
              ? <UserBubble key={msg.id} message={msg} />
              : <AssistantMessageView key={msg.id} message={msg} isGenerating={isGenerating} elapsed={elapsed}
                  onToggleToolGroup={(gid) => toggleToolGroup(msg.id, gid)} />,
          )
        )}
      </div>

      {/* Composer */}
      <div className="composer">
        <div className="composer-input-wrapper">
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入你的请求…  按 / 选择命令或技能"
            rows={1}
            disabled={!session}
          />
          {/* 斜杠命令菜单 */}
          {slashMenuOpen && filteredSlash.length > 0 && (
            <SlashMenu
              entries={filteredSlash}
              selectedIndex={slashIndex}
              onSelect={selectSlashEntry}
              onHover={setSlashIndex}
            />
          )}
          {/* 工具栏：左 controls + 右 send（） */}
          <div className="composer-button-row">
            <div className="composer-left-group">
              {/* Model 下拉选择 — 从供应商获取模型列表 + 自定义模型 ID */}
              <ModelPicker
                value={selectedModel}
                onChange={handleModelSelect}
                onFetchLive={fetchLiveModels}
                compact
              />
              {/* Thinking 强度选择器 */}
              <ComposerDropdown
                icon={<Brain size={14} />}
                value={THINKING_OPTIONS.find((o) => o.id === selectedThinking)?.label ?? 'Medium'}
                options={THINKING_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
                onSelect={(id) => setSelectedThinking(id)}
                tooltip="Thinking mode"
                maxWidth={80}
              />
              {/* Mode 选择器 — 图标触发器（：每个模式有独立图标） */}
              <ModeIconTrigger
                selectedMode={selectedMode}
                onSelect={setSelectedMode}
              />
              {/* Features 齿轮 */}
              <button className="composer-icon-badge" title="Agent features">
                <Settings2 size={14} />
              </button>
            </div>
            <div className="composer-right-group">
              {/* 上下文窗口圆环（ ContextWindowMeter） */}
              <ContextWindowRing
                usedTokens={contextUsed}
                maxTokens={contextMax}
                costUsd={sessionCost}
              />
              {isGenerating ? (
                <button className="composer-send composer-send--stop" onClick={handleInterrupt} title="中断">
                  <Square size={14} />
                </button>
              ) : (
                <button className="composer-send" onClick={handleSend} disabled={!input.trim() || !session} title="发送">
                  <ArrowUp size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Mode 图标触发器（ AgentModeControl）
// 每个模式有独立图标，点击弹出下拉选择
// ============================================================

function ModeIconTrigger({
  selectedMode,
  onSelect,
}: {
  selectedMode: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const current = MODE_OPTIONS.find((o) => o.id === selectedMode) ?? MODE_OPTIONS[0];
  const CurrentIcon = current.icon;

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.top - 4, left: rect.left });
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        const dd = document.getElementById('mode-dropdown-floating');
        if (!dd || !dd.contains(e.target as Node)) setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="composer-control-wrap">
      <button
        ref={btnRef}
        className={clsx('composer-control', open && 'composer-control--open')}
        onClick={() => setOpen((v) => !v)}
        title="更改模式"
      >
        <span className="composer-control-icon"><CurrentIcon size={14} /></span>
        <span className="composer-control-label" style={{ maxWidth: 80 }}>{current.label}</span>
        <ChevronDown size={12} className="composer-control-caret" />
      </button>
      {open && createPortal(
        <div id="mode-dropdown-floating" className="composer-dropdown-fixed" style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}>
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                className={clsx('composer-dropdown-item', selectedMode === opt.id && 'composer-dropdown-item--selected')}
                onClick={() => { onSelect(opt.id); setOpen(false); }}
              >
                <Icon size={14} style={{ marginRight: 8, flexShrink: 0 }} />
                {opt.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ============================================================
// 上下文窗口圆环（ ContextWindowMeter）
// SVG progress ring，颜色随使用率渐变：灰 <70% / 琥珀 70-90% / 红 >90%
// ============================================================

function ContextWindowRing({
  usedTokens,
  maxTokens,
  costUsd,
}: {
  usedTokens: number;
  maxTokens: number;
  costUsd: number;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const percentage = maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : 0;
  const size = 14;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percentage / 100) * circumference;

  // 颜色渐变逻辑（ getMeterColors）
  const color = percentage > 90 ? 'var(--yemu-error)' :
                percentage >= 70 ? 'var(--yemu-warning)' :
                'var(--yemu-text-muted)';
  const trackColor = 'var(--yemu-border)';

  const formatTokens = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };
  const formatCost = (n: number) => n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;

  return (
    <div
      className="context-ring-wrap"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
        />
      </svg>
      {showTooltip && (
        <div className="context-ring-tooltip">
          <div className="context-ring-tooltip-title">上下文窗口</div>
          <div className="context-ring-tooltip-text">已使用 {Math.round(percentage)}%</div>
          <div className="context-ring-tooltip-detail">{formatTokens(usedTokens)} / {formatTokens(maxTokens)} tokens</div>
          {costUsd > 0 && (
            <div className="context-ring-tooltip-detail">本次花费 {formatCost(costUsd)}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Composer 下拉控件（ AgentControlTrigger）
// ============================================================

interface DropdownOption { id: string; label: string }

function ComposerDropdown({
  icon,
  value,
  options,
  onSelect,
  tooltip,
  maxWidth = 100,
}: {
  icon: React.ReactNode;
  value: string;
  options: DropdownOption[];
  onSelect: (id: string) => void;
  tooltip: string;
  maxWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.top - 4, left: rect.left });
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        const dd = document.getElementById('composer-dropdown-floating');
        if (!dd || !dd.contains(e.target as Node)) setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="composer-control-wrap">
      <button
        ref={btnRef}
        className={clsx('composer-control', open && 'composer-control--open')}
        onClick={() => setOpen((v) => !v)}
        title={tooltip}
      >
        <span className="composer-control-icon">{icon}</span>
        <span className="composer-control-label" style={{ maxWidth }}>{value}</span>
        <ChevronDown size={12} className="composer-control-caret" />
      </button>
      {open && createPortal(
        <div id="composer-dropdown-floating" className="composer-dropdown-fixed" style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}>
          {options.map((opt) => (
            <button
              key={opt.id}
              className={clsx('composer-dropdown-item', value === opt.label && 'composer-dropdown-item--selected')}
              onClick={() => { onSelect(opt.id); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ============================================================
// 斜杠命令菜单
// ============================================================

function SlashMenu({
  entries,
  selectedIndex,
  onSelect,
  onHover,
}: {
  entries: SlashEntry[];
  selectedIndex: number;
  onSelect: (entry: SlashEntry) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div className="slash-menu">
      <div className="slash-menu-header">
        命令与技能
      </div>
      {entries.map((entry, i) => (
        <button
          key={`${entry.type}-${entry.name}`}
          className={clsx(
            'slash-menu-item',
            i === selectedIndex && 'slash-menu-item--selected',
          )}
          onClick={() => onSelect(entry)}
          onMouseEnter={() => onHover(i)}
        >
          <span className="slash-menu-item-label">{entry.label}</span>
          <span className="slash-menu-item-desc">{entry.description}</span>
          {entry.type === 'skill' && (
            <span className="slash-menu-item-badge">技能</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// 消息子组件
// ============================================================

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="user-bubble">
      <div className="user-bubble-content">
        <p>{message.content}</p>
      </div>
    </div>
  );
}

function AssistantMessageView({
  message, isGenerating, elapsed, onToggleToolGroup,
}: {
  message: ChatMessage;
  isGenerating: boolean;
  elapsed: number;
  onToggleToolGroup: (groupId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isLive = message.streaming && isGenerating;
  const displayDuration = message.durationMs ?? (isLive ? elapsed : undefined);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="assistant-message">
      <div className="assistant-avatar"><Sparkles size={14} /></div>
      <div className="assistant-message-body">
        {message.toolCallGroups?.map((group) => (
          <ToolCallGroupBadge key={group.id} group={group} onToggle={() => onToggleToolGroup(group.id)} />
        ))}
        {message.content ? (
          <div className="assistant-markdown">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {isLive && <span className="streaming-cursor">▋</span>}
          </div>
        ) : isLive ? (
          <div className="assistant-thinking">
            <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
          </div>
        ) : null}
        {!message.streaming && (
          <div className="turn-footer">
            <button className="turn-footer-copy" onClick={handleCopy} title="复制">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            {displayDuration !== undefined && (
              <span className="turn-footer-duration">
                {isLive ? formatDuration(elapsed) : formatDuration(displayDuration)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallGroupBadge({ group, onToggle }: { group: ToolCallGroup; onToggle: () => void }) {
  const summary = summarizeToolCalls(group.toolCalls);
  return (
    <div className={clsx('tool-group', group.expanded && 'tool-group--expanded')}>
      <button className="tool-group-header" onClick={onToggle}>
        <div className="tool-group-icon"><Wrench size={13} /></div>
        <span className="tool-group-label">{summary}</span>
        {group.expanded ? <ChevronDown size={13} /> : <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />}
      </button>
      {group.expanded && (
        <div className="tool-group-details">
          {group.toolCalls.map((tc) => {
            const inputPreview = JSON.stringify(tc.input, null, 2)?.slice(0, 200) ?? '';
            return (
              <div key={tc.id} className="tool-call-item">
                <span className="tool-call-name">{tc.name}</span>
                {inputPreview && <pre className="tool-call-input">{inputPreview}</pre>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
