'use client';

import React from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

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
      message: '',
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Une erreur inattendue est survenue.',
    };
  }

  public componentDidCatch(error: Error): void {
    // Log minimal côté client pour faciliter le diagnostic.
    // Le backend garde la source de vérité des erreurs API.
    console.error('ErrorBoundary:', error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  private handleGoDashboard = () => {
    window.location.href = '/dashboard';
  };

  public render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-theme-xs">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-red-50 p-2">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Oups, une erreur est survenue
              </h1>
              <p className="mt-1 text-sm text-slate-600">{this.state.message}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <RotateCcw size={14} />
              Réessayer
            </button>
            <button
              type="button"
              onClick={this.handleGoDashboard}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
