import { Component, type ErrorInfo, type ReactNode } from 'react';
import { IconAlertTriangle, IconLogo } from './ui/Icon';

interface State {
  hasError: boolean;
  errorMessage?: string;
}

/**
 * Phase 4 root error boundary.
 *
 * Catches uncaught render-tree exceptions and shows a friendly recovery
 * page. We deliberately keep the UI simple — no router/state hooks —
 * because by the time we're here the app may have crashed mid-render
 * and we can't trust higher-level providers.
 *
 * In dev we show the error message to speed up debugging; in prod we
 * still show the message but it's been formatted to the user's level
 * via the runtime error string. Stack traces stay in the console.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'Unknown error',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  private onReload = () => {
    window.location.reload();
  };

  private onGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white border border-border rounded shadow-card p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-status-red-bg text-status-red flex items-center justify-center mx-auto">
            <IconAlertTriangle size={22} />
          </div>
          <h1 className="text-xl font-bold text-navy mt-4">
            Something went wrong
          </h1>
          <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
            The page crashed unexpectedly. Reloading usually fixes it. If the
            problem persists, contact support.
          </p>
          {this.state.errorMessage && (
            <pre className="mt-4 text-[11px] text-status-red font-mono bg-status-red-bg/40 border border-status-red/20 rounded p-2 text-left overflow-x-auto">
              {this.state.errorMessage}
            </pre>
          )}
          <div className="flex items-center justify-center gap-2 mt-5">
            <button
              type="button"
              onClick={this.onGoHome}
              className="px-4 py-2 text-sm font-semibold border border-border rounded hover:border-primary hover:text-primary"
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={this.onReload}
              className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark inline-flex items-center gap-1.5"
            >
              <IconLogo size={14} /> Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
