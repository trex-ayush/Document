import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AppRouter } from './routes/AppRouter.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppRouter />
          <Toaster
            position="top-right"
            toastOptions={{
              className: '!bg-white dark:!bg-neutral-800 !text-neutral-900 dark:!text-neutral-100 !text-sm !shadow-dropdown !border !border-neutral-200 dark:!border-neutral-700',
              success: { iconTheme: { primary: '#16A34A', secondary: '#fff' } },
              error: { iconTheme: { primary: '#DC2626', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
