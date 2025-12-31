import { AlertCircle, RefreshCw } from 'lucide-react';
import type { FallbackProps } from 'react-error-boundary';

export function SectionErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-2xl border border-danger-500/20 bg-danger-500/5 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-500/20">
        <AlertCircle size={28} className="text-danger-400" />
      </div>

      <div>
        <p className="mb-1 text-lg font-semibold text-white">
          Algo falhou nesta seção
        </p>
        <p className="max-w-sm text-sm text-white/50">{error.message}</p>
      </div>

      <button
        type="button"
        onClick={resetErrorBoundary}
        className="btn-danger"
      >
        <RefreshCw size={16} />
        Tentar novamente
      </button>
    </div>
  );
}
