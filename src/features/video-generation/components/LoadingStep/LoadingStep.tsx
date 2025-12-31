import { GenerationProgress } from '@/features/video-generation/model/types';

type LoadingStepProps = {
  progress: GenerationProgress;
};

export function LoadingStep({ progress }: LoadingStepProps) {
  const percentage = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-blue-500 opacity-20 blur-3xl" />
        <div className="relative z-10 animate-spin text-blue-500">
          <svg className="h-16 w-16" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
          </svg>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">{progress.currentAction}</h2>
        <p className="text-gray-400">Nosso copiloto está aplicando princípios pedagógicos ao seu conteúdo.</p>
      </div>

      <div className="w-full max-w-md rounded-full border border-gray-700 bg-gray-900">
        <div
          className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="font-mono text-sm text-gray-500">
        {percentage}% ({progress.completed}/{progress.total})
      </p>
    </div>
  );
}
