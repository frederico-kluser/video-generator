import { FallbackProps } from 'react-error-boundary';

export function SectionErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-2xl border border-red-900/40 bg-red-950/30 p-6 text-center">
      <p className="text-xl font-semibold text-red-200">⚠️ Algo falhou nesta seção.</p>
      <p className="text-sm text-red-300">{error.message}</p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500"
      >
        Tentar novamente
      </button>
    </div>
  );
}
