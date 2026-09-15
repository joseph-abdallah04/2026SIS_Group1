import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
/*
 * Inter is served with the app rather than fetched from Google Fonts. A
 * sticky's size is measured by laying its note out in the font the page is
 * actually using, on each viewer's own machine; where the web font was blocked
 * or failed, that viewer measured in a fallback face and saw different sizes on
 * a board everyone shares. Bundled, every viewer measures in the same face.
 * The four weights are the ones the app uses. 700 is bold in a sticky: without
 * it the browser fell back to 600, a step above a note's own 500 that barely
 * read as bold at all.
 */
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
