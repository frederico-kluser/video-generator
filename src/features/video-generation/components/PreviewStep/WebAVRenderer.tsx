/**
 * WebAV Renderer Component
 * Gerencia exportação de vídeo usando WebAV SDK (20x mais rápido que FFmpeg.wasm)
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, Film, Loader2 } from 'lucide-react';
import { useWebAVRenderer } from '@/shared/hooks/useWebAVRenderer';
import type { WebAVSlideConfig } from '@/shared/types/webav.types';
import { toMicroseconds } from '@/shared/types/webav.types';
import type { Slide } from '@/features/video-generation/model/types';
import type { AspectRatio } from '@/config/constants/video';
import { VIDEO_CONFIG } from '@/config/constants/video';
import { appLogger } from '@/shared/logging/logger';

interface WebAVRendererProps {
  slides: Slide[];
  aspectRatio: AspectRatio;
  isRendering: boolean;
  onRenderStart: () => void;
  onRenderComplete: () => void;
  onRenderError: (error: Error) => void;
}

export function WebAVRenderer({
  slides,
  aspectRatio,
  isRendering,
  onRenderStart,
  onRenderComplete,
  onRenderError,
}: WebAVRendererProps) {
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState('');

  const getResolution = useCallback(() => {
    const { width, height } = VIDEO_CONFIG.DEFAULT_RESOLUTION;
    if (aspectRatio === '9:16') return { width: height, height: width };
    if (aspectRatio === '1:1')
      return { width: Math.min(width, height), height: Math.min(width, height) };
    return { width, height };
  }, [aspectRatio]);

  const { render, cancel, capabilities } = useWebAVRenderer({
    config: getResolution(),
    onProgress: (progress) => {
      setRenderProgress(Math.round(progress.progress * 100));
      setRenderStatus(progress.status);
    },
    onError: (error) => {
      appLogger.error('WebAV render error', { error });
      onRenderError(error);
    },
  });

  const convertSlidesToWebAVConfig = useCallback(
    async (inputSlides: Slide[]): Promise<WebAVSlideConfig[]> => {
      let offset: number = 0;

      const configs: WebAVSlideConfig[] = [];

      for (const slide of inputSlides) {
        // Calcular duração do slide baseado no áudio ou fallback
        let durationSeconds = 3; // Fallback padrão

        if (slide.audioBlob) {
          try {
            const audioContext = new AudioContext();
            const arrayBuffer = await slide.audioBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            durationSeconds = audioBuffer.duration;
            audioContext.close();
          } catch (error) {
            appLogger.warn('Failed to decode audio duration, using fallback', {
              slideId: slide.id,
              error,
            });
          }
        }

        const duration = toMicroseconds(durationSeconds);

        configs.push({
          id: slide.id,
          imageUrl: slide.imageUrl || '',
          audioUrl: slide.audioBlob
            ? URL.createObjectURL(slide.audioBlob)
            : '',
          duration,
          offset,
          zIndex: 1,
        });

        offset += duration;
      }

      appLogger.info('Converted slides to WebAV config', {
        slideCount: configs.length,
        totalDuration: offset,
      });

      return configs;
    },
    [],
  );

  const handleRender = useCallback(async () => {
    if (isRendering) return;

    onRenderStart();

    try {
      const webavSlides = await convertSlidesToWebAVConfig(slides);
      const result = await render(webavSlides);

      // Download do vídeo renderizado
      if (result.blobUrl) {
        const anchor = document.createElement('a');
        anchor.href = result.blobUrl;
        anchor.download = `eduscript_video_${Date.now()}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        // Cleanup blob URLs dos áudios
        webavSlides.forEach((slide) => {
          if (slide.audioUrl.startsWith('blob:')) {
            URL.revokeObjectURL(slide.audioUrl);
          }
        });

        appLogger.info('✅ Video downloaded successfully', {
          blobUrl: result.blobUrl,
          size: result.size,
        });
      }

      onRenderComplete();
    } catch (error) {
      appLogger.error('Render failed', { error });
      onRenderError(
        error instanceof Error ? error : new Error('Unknown render error'),
      );
    }
  }, [
    slides,
    isRendering,
    onRenderStart,
    onRenderComplete,
    onRenderError,
    convertSlidesToWebAVConfig,
    render,
  ]);

  useEffect(() => {
    return () => {
      if (isRendering) {
        cancel();
      }
    };
  }, [isRendering, cancel]);

  // Verificar compatibilidade do navegador
  if (!capabilities.supported) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error-500/20">
            <Film size={24} className="text-error-400" />
          </div>
          <div className="flex-1">
            <h3 className="mb-2 font-semibold text-white">
              WebCodecs não suportado
            </h3>
            <p className="mb-4 text-sm text-white/70">
              Seu navegador ({capabilities.browserName}{' '}
              {capabilities.browserVersion}) não suporta WebCodecs API. Para usar
              renderização com aceleração de GPU, utilize:
            </p>
            <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-white/70">
              <li>Chrome 102+ (recomendado)</li>
              <li>Edge 102+</li>
            </ul>
            <div className="rounded-lg bg-dark-800/50 p-3 text-xs">
              <div className="mb-1 font-medium text-white/90">Status:</div>
              <div className="space-y-0.5 font-mono text-white/60">
                <div>
                  VideoEncoder:{' '}
                  {capabilities.hasVideoEncoder ? '✅' : '❌'}
                </div>
                <div>
                  VideoDecoder:{' '}
                  {capabilities.hasVideoDecoder ? '✅' : '❌'}
                </div>
                <div>
                  AudioEncoder:{' '}
                  {capabilities.hasAudioEncoder ? '✅' : '❌'}
                </div>
                <div>
                  AudioDecoder:{' '}
                  {capabilities.hasAudioDecoder ? '✅' : '❌'}
                </div>
                <div>
                  SharedArrayBuffer:{' '}
                  {capabilities.hasSharedArrayBuffer ? '✅' : '❌'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Rendering overlay */}
      {isRendering && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-dark-950/95 backdrop-blur-sm">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary-500/30" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary-500/20">
              <Film size={36} className="animate-pulse text-primary-400" />
            </div>
          </div>
          <div className="text-center">
            <p className="mb-2 text-xl font-semibold text-white">
              Renderizando com WebAV
            </p>
            <p className="mb-1 text-sm text-white/70">{renderStatus}</p>
            <p className="text-xs text-white/50">
              Acelerado por GPU • 20x mais rápido
            </p>
          </div>
          <div className="w-80">
            <div className="progress-bar h-3">
              <div
                className="progress-fill"
                style={{ width: `${renderProgress}%` }}
              />
            </div>
            <p className="mt-2 text-center font-mono text-sm text-primary-400">
              {renderProgress}%
            </p>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="btn-secondary px-6"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Render button */}
      <button
        type="button"
        onClick={handleRender}
        disabled={isRendering || slides.length === 0}
        className="btn-primary px-6"
      >
        {isRendering ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Renderizando...
          </>
        ) : (
          <>
            <Download size={20} />
            Exportar vídeo (WebAV)
          </>
        )}
      </button>
    </>
  );
}
