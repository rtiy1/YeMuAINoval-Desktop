import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AppLayout } from './components/AppLayout';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { WritingPage } from './features/writing/WritingPage';
import { CharactersPage } from './features/characters/CharactersPage';
import { WorldInfoPage } from './features/world-info/WorldInfoPage';
import { SettingsPage } from './features/settings/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/project/:projectId" element={<WritingPage />} />
          <Route path="/project/:projectId/characters" element={<CharactersPage />} />
          <Route path="/project/:projectId/world-info" element={<WorldInfoPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
