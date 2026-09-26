import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AppRouter } from './routes/AppRouter.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import WakeUpScreen from './components/layout/WakeUpScreen.jsx';
import { startServerWake } from './services/serverWake.js';
import './i18n/index.js'; // side-effect: initializes i18next (English/Hindi) before first render
import './index.css';

// TanStack Query is the app's server-state layer (docs/DECISIONS.md
// "Frontend" — no Redux/Zustand). Defaults tuned for a documents/folders app
// that isn't updating every second: avoid refetch-on-window-focus thrashing
// while still refetching stale data on mount, and don't retry 401s forever
// (apiClient's own refresh-on-401 interceptor already handles that case).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error?.response?.status === 401) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

// The API server sleeps when nobody has used it for a while: start checking it right away, in
// parallel with the sign-in check, so WakeUpScreen can explain a slow first load.
startServerWake();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppRouter />
          <Toaster
            position="top-right"
            toastOptions={{
              // react-hot-toast styles toasts inline, so colours come in through `style` (theme CSS
              // variables from index.css, which switch with dark mode) rather than !important classes.
              style: {
                background: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-dropdown)',
                fontSize: '0.875rem',
                // A long file name with no spaces wraps inside the toast instead of running out of it.
                overflowWrap: 'anywhere',
              },
              success: { iconTheme: { primary: '#16A34A', secondary: '#fff' } },
              error: { iconTheme: { primary: '#DC2626', secondary: '#fff' } },
            }}
          />
          <WakeUpScreen />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
