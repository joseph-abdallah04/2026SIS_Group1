import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
/*
 * Inter is served with the app rather than fetched from Google Fonts. A
 * sticky's size is measured by laying its note out in the font the page is
 * actually using, on each viewer's own machine; where the web font was blocked
 * or failed, that viewer measured in a fallback face and saw different sizes on
 * a board everyone shares. Bundled, every viewer measures in the same face.
 * The three weights are the ones the app uses.
 */
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
