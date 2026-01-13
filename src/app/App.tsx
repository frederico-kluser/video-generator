import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { getEnv } from '@/config/env';
import { AudioJoinLab } from '@/features/audio-join/components/AudioJoinLab/AudioJoinLab';
import { AudioRecorderLabPage } from '@/features/audio-lab';
import { AudioSilenceLabPage } from '@/features/audio-silence/components/AudioSilenceLabPage/AudioSilenceLabPage';
import { AudioSplitTestPage } from '@/features/audio-split/components/AudioSplitTestPage/AudioSplitTestPage';
import { LofiVideoLab } from '@/features/lofi-video';
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
  } else if (normalizedPath === '/audio/join' || normalizedPath === '/audio-join') {
    page = <AudioJoinLab />;
  } else if (normalizedPath === '/audio/recorder-lab') {
    page = <AudioRecorderLabPage />;
  } else if (normalizedPath === '/audio-silence') {
    page = <AudioSilenceLabPage />;
  } else if (normalizedPath === '/audio-split') {
    page = <AudioSplitTestPage />;
  } else if (normalizedPath === '/lofi') {
    page = <LofiVideoLab />;
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
