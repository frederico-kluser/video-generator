import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { getEnv } from '@/config/env';
import { VideoGenerationFlow } from '@/features/video-generation/components/VideoGenerationFlow/VideoGenerationFlow';
import { SectionErrorFallback } from '@/shared/components/error-boundary/SectionErrorFallback';

export function App() {
  useEffect(() => {
    const { appTitle } = getEnv();
    document.title = appTitle;
  }, []);

  return (
    <div className="min-h-screen w-full bg-gray-950 text-white">
      <ErrorBoundary FallbackComponent={SectionErrorFallback} resetKeys={[]}>
        <VideoGenerationFlow />
      </ErrorBoundary>
    </div>
  );
}
