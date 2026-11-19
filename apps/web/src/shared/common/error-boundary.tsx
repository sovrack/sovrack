"use client";

import React from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Une erreur inattendue est survenue.",
    };
  }

  public componentDidCatch(error: Error): void {
    // Minimal client-side log to ease diagnostics.
    // The backend keeps the source of truth for API errors.
    console.error("ErrorBoundary:", error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: "" });
    window.location.reload();
  };

  private handleGoDashboard = () => {
    window.location.href = "/dashboard";
  };

  public render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] px-4">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-[var(--bg-card)] p-6 shadow-theme-xs">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-red-500/15 p-2">
              <AlertTriangle size={20} className="text-red-300" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                Oups, une erreur est survenue
              </h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {this.state.message}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:bg-[var(--text-primary)]"
            >
              <RotateCcw size={14} />
              Retry
            </button>
            <button
              type="button"
              onClick={this.handleGoDashboard}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10"
            >
              <Home size={14} />
              Retour au dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
