/**
 * 全局应用状态 — 当前项目、活动章节、侧栏折叠状态。
 */

import { create } from 'zustand';

interface AppState {
  /** 当前打开的项目 ID。 */
  currentProjectId: string | null;
  /** 活动章节 ID（编辑器正在编辑）。 */
  activeChapterId: string | null;
  /** 左侧导航是否展开。 */
  sidebarCollapsed: boolean;
  /** 右侧 Agent 面板是否展开。 */
  assistantOpen: boolean;

  setCurrentProject: (id: string | null) => void;
  setActiveChapter: (id: string | null) => void;
  toggleSidebar: () => void;
  toggleAssistant: () => void;
  setAssistantOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentProjectId: null,
  activeChapterId: null,
  sidebarCollapsed: false,
  assistantOpen: true,

  setCurrentProject: (id) => set({ currentProjectId: id }),
  setActiveChapter: (id) => set({ activeChapterId: id }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleAssistant: () => set((s) => ({ assistantOpen: !s.assistantOpen })),
  setAssistantOpen: (open) => set({ assistantOpen: open }),
}));
