import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import type { FallbackProps } from 'react-error-boundary';

export function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      {/* Error icon */}
      <div className="relative">
        <div className="absolute inset-0 animate-pulse rounded-full bg-danger-500/30 blur-xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-danger-500/20">
          <AlertTriangle size={40} className="text-danger-400" />
        </div>
      </div>

      {/* Error message */}
      <div className="max-w-md">
        <h1 className="mb-2 text-2xl font-bold text-white">
          Algo deu errado
        </h1>
        <p className="text-white/60">
          Ocorreu um erro inesperado ao carregar o aplicativo.
        </p>
      </div>

      {/* Error details */}
      <div className="glass-card max-w-lg overflow-hidden">
        <div className="border-b border-white/5 px-4 py-2">
          <span className="text-xs font-medium text-white/40">Detalhes do erro</span>
        </div>
        <pre className="max-h-32 overflow-auto p-4 text-left font-mono text-xs text-danger-300">
          {error.message}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="btn-primary"
        >
          <RefreshCw size={18} />
          Tentar novamente
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-secondary"
        >
          <RotateCcw size={18} />
          Recarregar página
        </button>
      </div>
    </div>
  );
}
