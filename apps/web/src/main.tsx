import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerRealtimeHandlers } from './lib/realtime';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerRealtimeHandlers();