import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { getEnv } from '@/config/env';
import { AudioCleanupLab } from '@/features/audio-lab/components/AudioCleanupLab/AudioCleanupLab';
import { AudioEqualizerLab } from '@/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab';
import { VideoGenerationFlow } from '@/features/video-generation/components/VideoGenerationFlow/VideoGenerationFlow';
import { VideoBatchDebugPage } from '@/features/video-generation/components/VideoBatchDebugPage/VideoBatchDebugPage';
import { RenderTestPage } from '@/features/render-test/components/RenderTestPage/RenderTestPage';
import { SectionErrorFallback } from '@/shared/components/error-boundary/SectionErrorFallback';
import { useUrlOnlyDebugMode } from '@/shared/hooks/useDebugMode';

export function App() {
  const isDebugMode = useUrlOnlyDebugMode();

  useEffect(() => {
    const { appTitle } = getEnv();
    document.title = isDebugMode ? `${appTitle} - Debug Mode` : appTitle;
  }, [isDebugMode]);

  const normalizedPath =
    typeof window !== 'undefined'
      ? window.location.pathname.replace(/\/$/, '') || '/'
      : '/';

  let page: JSX.Element = <VideoGenerationFlow />;

  if (normalizedPath === '/render-test') {
    page = <RenderTestPage />;
  } else if (normalizedPath === '/audio-lab') {
    page = <AudioCleanupLab />;
  } else if (normalizedPath === '/audio-eq-lab') {
    page = <AudioEqualizerLab />;
  } else if (normalizedPath === '/debug-video-tests') {
    page = isDebugMode ? <VideoBatchDebugPage /> : <VideoGenerationFlow />;
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
