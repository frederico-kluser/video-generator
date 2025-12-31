import type { FallbackProps } from 'react-error-boundary';

export function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-6 text-center">
      <span className="text-4xl" role="img" aria-label="boom">
        💥
      </span>
      <p className="text-lg font-semibold text-white">
        Algo deu errado ao carregar o aplicativo.
      </p>
      <pre className="max-w-lg overflow-x-auto rounded-lg bg-gray-900 p-4 text-left text-xs text-red-300">
        {error.message}
      </pre>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          Tentar novamente
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800"
        >
          Recarregar página
        </button>
      </div>
    </div>
  );
}
