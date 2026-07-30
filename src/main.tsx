import React, { StrictMode, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[GlobalErrorBoundary] App execution caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 text-center z-[99999] font-sans">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mb-4 text-rose-400 font-bold text-xl">
            ⚠️
          </div>
          <h1 className="text-xl font-bold mb-2 text-white">Application Startup Error</h1>
          <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
            {this.state.error?.message || 'An error occurred during application initialization.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-lg"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <GlobalErrorBoundary>
          <App />
        </GlobalErrorBoundary>
      </StrictMode>
    );
  } catch (err: any) {
    console.error('[Mount Error] Exception during root render:', err);
    rootElement.innerHTML = `
      <div style="position: fixed; inset: 0; background-color: #0f172a; color: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; font-family: system-ui, sans-serif;">
        <h2 style="font-size: 20px; font-weight: 800; margin-bottom: 8px;">Initialization Failed</h2>
        <p style="font-size: 13px; color: #94a3b8; max-width: 400px; margin-bottom: 20px;">${err?.message || "Unable to start application."}</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; background-color: #14b8a6; color: #0f172a; border: none; border-radius: 10px; font-weight: 800; cursor: pointer;">Reload Application</button>
      </div>
    `;
  }
}

// Register PWA ServiceWorker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('[PWA] ServiceWorker registered successfully with scope:', registration.scope);
      },
      (error) => {
        console.error('[PWA] ServiceWorker registration failed:', error);
      }
    );
  });
}
