import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@radix-ui/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from './App';
import { useThemeStore } from './stores/theme-store';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Root() {
  const theme = useThemeStore((s) => s.theme);

  // 主题变化时同步到 document.documentElement.dataset.theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Radix Themes 仅控制组件库的暗色外观；
  // 实际配色由 global.css 的 --yemu-* 变量驱动。
  return (
    <Theme appearance="dark" accentColor="iris" radius="medium" scaling="100%">
      <App />
    </Theme>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
