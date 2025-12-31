import { Sparkles, Wand2 } from 'lucide-react';
import type { GenerationProgress } from '@/features/video-generation/model/types';

type LoadingStepProps = {
  progress: GenerationProgress;
};

export function LoadingStep({ progress }: LoadingStepProps) {
  const percentage =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {/* Animated background orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-64 w-64 animate-float rounded-full bg-primary-600/20 blur-[80px]" />
        <div className="animation-delay-2000 absolute right-1/4 top-1/2 h-48 w-48 animate-float rounded-full bg-accent-600/20 blur-[60px]" />
        <div className="animation-delay-4000 absolute bottom-1/4 left-1/2 h-56 w-56 animate-float rounded-full bg-primary-500/15 blur-[70px]" />
      </div>

      {/* Loader */}
      <div className="relative">
        {/* Outer glow ring */}
        <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-primary-500 to-accent-500 opacity-30 blur-xl" />

        {/* Spinning ring */}
        <div className="relative flex h-32 w-32 items-center justify-center">
          <div className="absolute inset-0 animate-spin-slow rounded-full border-4 border-transparent border-t-primary-500 border-r-accent-400" />
          <div className="absolute inset-2 animate-spin rounded-full border-4 border-transparent border-b-primary-400 border-l-accent-500" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />

          {/* Center icon */}
          <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-dark-800/80 backdrop-blur-sm">
            <Wand2 size={28} className="animate-pulse text-primary-400" />
          </div>
        </div>
      </div>

      {/* Text content */}
      <div className="relative z-10 max-w-md text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-500/10 px-4 py-1.5 text-sm font-medium text-primary-300">
          <Sparkles size={14} className="animate-pulse" />
          IA trabalhando
        </div>
        <h2 className="mb-2 text-2xl font-bold text-white">
          {progress.currentAction}
        </h2>
        <p className="text-white/50">
          Nosso copiloto está aplicando princípios pedagógicos ao seu conteúdo
        </p>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 w-full max-w-md">
        <div className="progress-bar h-3">
          <div
            className="progress-fill"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="font-mono text-white/40">
            {progress.completed}/{progress.total} etapas
          </span>
          <span className="font-semibold text-primary-400">
            {percentage}%
          </span>
        </div>
      </div>

      {/* Loading hints */}
      <div className="glass-card mt-4 max-w-sm p-4 text-center">
        <p className="text-sm text-white/40">
          Estamos gerando um roteiro otimizado para aprendizado e criando imagens exclusivas para cada slide
        </p>
      </div>
    </div>
  );
}
