import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { SessionPinboard } from './features/pinboard/SessionPinboard';
import { RequireAuth } from './lib/auth';
import {
  DashboardPage,
  LoginPage,
  NotFoundPage,
  SettingsPage,
  SignupPage,
} from './pages';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        {/* F14: session board is public until auth module lands (API is also open). */}
        <Route path="/sessions/:id" element={<SessionPinboard />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
