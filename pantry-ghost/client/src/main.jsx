import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './index.css';
import { registerSW } from './lib/registerSW.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => count < 1 && ![401, 403, 404].includes(err?.response?.status),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

registerSW();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              className: '!bg-card !text-card-foreground !border !border-border !shadow-lg !text-sm',
              success: { iconTheme: { primary: 'hsl(var(--success))', secondary: 'hsl(var(--card))' } },
              error: { iconTheme: { primary: 'hsl(var(--destructive))', secondary: 'hsl(var(--card))' } },
            }}
          />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
