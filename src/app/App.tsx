import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { getEnv } from '@/config/env';
import { VideoGenerationFlow } from '@/features/video-generation/components/VideoGenerationFlow/VideoGenerationFlow';
import { SectionErrorFallback } from '@/shared/components/error-boundary/SectionErrorFallback';
import { ThemeSelector } from '@/shared/components/theme/ThemeSelector';

export function App() {
  useEffect(() => {
    const { appTitle } = getEnv();
    document.title = appTitle;
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      <div className="pointer-events-none fixed right-4 top-4 z-50 max-w-xs sm:max-w-sm">
        <div className="pointer-events-auto">
          <ThemeSelector />
        </div>
      </div>
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary-600/20 blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-accent-600/20 blur-[100px]" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-900/10 blur-[120px]" />
      </div>

      {/* Main content */}
      <ErrorBoundary FallbackComponent={SectionErrorFallback} resetKeys={[]}>
        <VideoGenerationFlow />
      </ErrorBoundary>
    </div>
  );
}
