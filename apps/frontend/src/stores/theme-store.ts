/**
 * 主题状态 — 多主题切换（night / dark / sepia）。
 *
 * 使用 zustand persist 中间件持久化到 localStorage。
 * 切换主题时同步设置 document.documentElement.dataset.theme，
 * 驱动 global.css 中的 [data-theme="xxx"] 选择器覆盖 CSS 变量。
 *
 * Radix Themes 的 <Theme appearance> 只有 dark/light，
 * 实际配色由 --yemu-* 自定义变量驱动，Radix 仅控制组件库暗色外观。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId = 'night' | 'dark' | 'sepia';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'night',
    label: '夜幕深色',
    description: '护眼深色，紫色调强调（默认）',
  },
  {
    id: 'dark',
    label: '经典深色',
    description: '高对比黑色背景，蓝色强调',
  },
  {
    id: 'sepia',
    label: '暖色护眼',
    description: '棕调暖色背景，适合长时间阅读',
  },
];

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

/** 将主题应用到 document.documentElement.dataset.theme。 */
function applyTheme(theme: ThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'night',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: 'yemu-theme',
      // 首次加载时从 localStorage 恢复后立即应用主题
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyTheme(state.theme);
        }
      },
    },
  ),
);

/**
 * 在模块加载时立即应用一次主题（防止首屏闪烁）。
 * persist 中间件同步读取 localStorage，此时 store 已有正确值。
 */
if (typeof window !== 'undefined') {
  const stored = window.localStorage.getItem('yemu-theme');
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { state?: { theme?: ThemeId } };
      if (parsed.state?.theme) {
        applyTheme(parsed.state.theme);
      }
    } catch {
      // 忽略损坏的 localStorage 数据
    }
  } else {
    applyTheme('night');
  }
}
