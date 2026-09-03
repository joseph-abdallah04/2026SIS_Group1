import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { SessionPinboard } from './features/pinboard/SessionPinboard';
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
          <Route path="/sessions/:id" element={<SessionPinboard />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
