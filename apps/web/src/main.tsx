import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyDevIdentityFromUrl } from './lib/devIdentity';
import './index.css';

// Before render: the route guard and the socket handshake both read what this
// stores, and both run as soon as the app mounts. No-op outside development.
applyDevIdentityFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
