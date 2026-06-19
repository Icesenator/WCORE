"use client";

import { Component, type ReactNode } from "react";

interface Props {
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export function ErrorFallback({ error }: { error?: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-100 p-4">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-gray-400 text-sm">
          The application encountered an unexpected error. Please try refreshing
          the page.
        </p>
        {error && (
          <p className="text-gray-500 text-xs font-mono break-all">
            {error.message}
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-green-600 rounded-lg text-sm hover:bg-green-500 transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
