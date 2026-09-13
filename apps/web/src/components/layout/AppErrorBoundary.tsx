import { Component, type ErrorInfo, type ReactNode } from "react";

import "./AppErrorBoundary.css";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps a render failure in one screen from blanking the whole application. Without
 * this, any thrown error in any route unmounts the entire React tree and leaves a
 * white page with no way back.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Zoption screen failed to render", error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="app-crash">
        <div className="app-crash-panel" role="alert">
          <h1>This screen stopped working</h1>
          <p>
            Zoption could not finish drawing this page. Nothing was saved while it was open, so
            reloading is safe.
          </p>
          <div className="app-crash-actions">
            <button className="button primary" type="button" onClick={() => window.location.reload()}>
              Reload Zoption
            </button>
            <a className="button secondary" href="/app">
              Go to your dashboard
            </a>
          </div>
          <details className="app-crash-details">
            <summary>Technical details for a support report</summary>
            <p className="app-crash-message">
              {error.name}: {error.message}
            </p>
          </details>
        </div>
      </main>
    );
  }
}
