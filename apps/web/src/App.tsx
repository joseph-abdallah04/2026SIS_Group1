import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { CreateSessionPage } from './features/sessions/CreateSessionPage';
import { EditSessionPage } from './features/sessions/EditSessionPage';
import { JoinSessionPage } from './features/sessions/JoinSessionPage';
import { SessionRouter } from './features/sessions/SessionRouter';
import { RequireAuth } from './lib/auth';
import { DashboardPage, LoginPage, NotFoundPage, SettingsPage, SignupPage } from './pages';

const CreativeToolsWorkbench = import.meta.env.DEV
  ? lazy(() =>
      import('./features/tools/dev/CreativeToolsWorkbench').then((module) => ({
        default: module.CreativeToolsWorkbench,
      })),
    )
  : null;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        {CreativeToolsWorkbench ? (
          <Route
            path="/dev/creative-tools"
            element={
              <Suspense fallback={null}>
                <CreativeToolsWorkbench />
              </Suspense>
            }
          />
        ) : null}
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/sessions/new" element={<CreateSessionPage />} />
          <Route path="/sessions/:id/edit" element={<EditSessionPage />} />
          <Route path="/sessions/:id" element={<SessionRouter />} />
          <Route path="/join/:code" element={<JoinSessionPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
