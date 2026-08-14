/**
 * AppLayout — 沉浸式三栏布局骨架。
 *
 * [左导航] [主内容区] [Agent 对话面板]
 * 左导航可折叠为图标条；Agent 面板可收起。
 */

import { Outlet, useNavigate, useLocation, useParams } from 'react-router';
import {
  BookOpen,
  Users,
  Globe,
  Settings as SettingsIcon,
  Library,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { clsx } from 'clsx';

import { useAppStore } from '@/stores/app-store';
import { AssistantPanel } from '@/components/AssistantPanel';
import './AppLayout.css';

interface NavItem {
  label: string;
  icon: typeof BookOpen;
  href: string | null;
  match: (pathname: string) => boolean;
  requiresProject?: boolean;
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams<{ projectId: string }>();
  const { sidebarCollapsed, assistantOpen, toggleSidebar, toggleAssistant } = useAppStore();

  const navItems: NavItem[] = [
    {
      label: '项目',
      icon: Library,
      href: '/',
      match: (p) => p === '/',
    },
    {
      label: '写作',
      icon: BookOpen,
      href: projectId ? `/project/${projectId}` : null,
      match: (p) => /\/project\/[^/]+\/?$/.test(p),
      requiresProject: true,
    },
    {
      label: '角色',
      icon: Users,
      href: projectId ? `/project/${projectId}/characters` : null,
      match: (p) => p.includes('/characters'),
      requiresProject: true,
    },
    {
      label: '世界观',
      icon: Globe,
      href: projectId ? `/project/${projectId}/world-info` : null,
      match: (p) => p.includes('/world-info'),
      requiresProject: true,
    },
  ];

  return (
    <div className="app-layout">
      {/* 左导航 */}
      <aside
        className={clsx('app-sidebar', sidebarCollapsed && 'app-sidebar--collapsed')}
      >
        <button
          className="btn-icon app-sidebar-toggle"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <nav className="app-sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.match(location.pathname);
            const disabled = item.requiresProject && !item.href;
            return (
              <button
                key={item.label}
                className={clsx('app-sidebar-item', active && 'app-sidebar-item--active', disabled && 'app-sidebar-item--disabled')}
                onClick={() => item.href && navigate(item.href)}
                disabled={disabled}
                title={item.label}
              >
                <Icon size={20} />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="app-sidebar-footer">
          <button
            className={clsx('app-sidebar-item', location.pathname === '/settings' && 'app-sidebar-item--active')}
            onClick={() => navigate('/settings', { state: { from: location.pathname } })}
            title="设置"
          >
            <SettingsIcon size={20} />
            {!sidebarCollapsed && <span>设置</span>}
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="app-main">
        <Outlet />
      </main>

      {/* 右侧 Agent 面板 */}
      {assistantOpen && projectId ? (
        <AssistantPanel projectId={projectId} onClose={toggleAssistant} />
      ) : (
        projectId && (
          <button className="btn-icon app-assistant-open-btn" onClick={toggleAssistant} title="打开 AI 助手">
            <PanelRightOpen size={18} />
          </button>
        )
      )}
    </div>
  );
}
