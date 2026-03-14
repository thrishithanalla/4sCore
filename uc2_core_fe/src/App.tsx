/**
 * Core Service Application
 * Main application component for Core Service module
 */

import React, { useMemo, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PrimeReact from 'primereact/api';
import { PrimeReactProvider } from 'primereact/api';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './utils/theme';
import CoreService from './CoreService';
import './index.css';

// Create QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60000, // 1 minute
      gcTime: 300000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// PrimeReact configuration
const primeReactConfig = {
  ripple: true,
  inputStyle: 'outlined' as const,
  cssTransition: true,
  autoZIndex: true,
  hideOverlaysOnDocumentScrolling: false,
  zIndex: {
    modal: 1100,
    overlay: 1000,
    menu: 1000,
    tooltip: 1100,
  },
};

const App: React.FC = () => {
  const value = useMemo(() => primeReactConfig, []);

  // Ensure PrimeReact config is set globally
  useEffect(() => {
    PrimeReact.ripple = primeReactConfig.ripple;
    PrimeReact.inputStyle = primeReactConfig.inputStyle;
    PrimeReact.autoZIndex = primeReactConfig.autoZIndex;
    PrimeReact.hideOverlaysOnDocumentScrolling = primeReactConfig.hideOverlaysOnDocumentScrolling;
    PrimeReact.zIndex = primeReactConfig.zIndex;
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PrimeReactProvider value={value}>
          <ThemeProvider>
            <CoreService />
          </ThemeProvider>
        </PrimeReactProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
export { App };
