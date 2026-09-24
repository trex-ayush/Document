import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './routes/AppRouter.jsx';
import './index.css';

// NOTE for Agent D: wrap <AppRouter /> with QueryClientProvider, ThemeProvider, AuthProvider and
// the react-hot-toast <Toaster/> here once those contexts/services exist (see
// docs/UI_KIT.md once you've written it). Keep this file's shape — the lead only touches
// AppRouter.jsx, not this file — but this bootstrap file is fair game for you to extend.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
