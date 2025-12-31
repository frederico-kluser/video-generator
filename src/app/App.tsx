import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { getEnv } from '@/config/env';
import { AudioCleanupLab } from '@/features/audio-lab/components/AudioCleanupLab/AudioCleanupLab';
import { VideoGenerationFlow } from '@/features/video-generation/components/VideoGenerationFlow/VideoGenerationFlow';
import { RenderTestPage } from '@/features/render-test/components/RenderTestPage/RenderTestPage';
import { SectionErrorFallback } from '@/shared/components/error-boundary/SectionErrorFallback';

export function App() {
  useEffect(() => {
    const { appTitle } = getEnv();
    document.title = appTitle;
  }, []);

  const normalizedPath =
    typeof window !== 'undefined'
      ? window.location.pathname.replace(/\/$/, '') || '/'
      : '/';

  let page: JSX.Element = <VideoGenerationFlow />;

  if (normalizedPath === '/render-test') {
    page = <RenderTestPage />;
  } else if (normalizedPath === '/audio-lab') {
    page = <AudioCleanupLab />;
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary-600/20 blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-accent-600/20 blur-[100px]" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-900/10 blur-[120px]" />
      </div>

      {/* Main content */}
      <ErrorBoundary FallbackComponent={SectionErrorFallback} resetKeys={[]}>
        {page}
      </ErrorBoundary>
    </div>
  );
}
