/**
 * Hook principal para renderização de vídeo com WebAV.
 * Gerencia o ciclo completo: criar sprites → combinar → exportar MP4.
 */

import { useCallback, useRef, useState } from 'react';
import { Combinator, OffscreenSprite, ImgClip, AudioClip } from '@webav/av-cliper';
import type {
  WebAVSlideConfig,
  WebAVRenderConfig,
  RenderProgress,
  RenderResult,
  EnrichedSprite,
  Microseconds,
} from '@/shared/types/webav.types';
import { WebAVError } from '@/shared/types/webav.types';
import {
  blobToStream,
  closeVideoFrame,
  calculateTotalDuration,
  estimateFileSize,
  detectWebCodecsCapabilities,
} from '@/shared/utils/webav.utils';
import { appLogger } from '@/shared/logging/logger';

interface UseWebAVRendererOptions {
  /** Configuração de renderização do vídeo */
  config: WebAVRenderConfig;
  /** Callback de progresso */
  onProgress?: (progress: RenderProgress) => void;
  /** Callback de erro */
  onError?: (error: WebAVError) => void;
}

interface UseWebAVRendererReturn {
  /** Inicia renderização dos slides */
  render: (slides: WebAVSlideConfig[]) => Promise<RenderResult>;
  /** Cancela renderização em andamento */
  cancel: () => void;
  /** Estado atual */
  isRendering: boolean;
  /** Progresso atual (0-1) */
  progress: number;
  /** Capabilities do navegador */
  capabilities: ReturnType<typeof detectWebCodecsCapabilities>;
}

export function useWebAVRenderer({
  config,
  onProgress,
  onError,
}: UseWebAVRendererOptions): UseWebAVRendererReturn {
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const capabilities = detectWebCodecsCapabilities();

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      appLogger.info('🚫 Cancelling WebAV render');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsRendering(false);
      setProgress(0);
    }
  }, []);

  const createImageClip = useCallback(
    async (imageUrl: string, slideId: string): Promise<ImgClip> => {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);
        
        appLogger.info(`🖼️ Created image clip for slide ${slideId}`, {
          width: imageBitmap.width,
          height: imageBitmap.height,
        });

        return new ImgClip(imageBitmap);
      } catch (error) {
        const webavError = new WebAVError(
          `Failed to create image clip for slide ${slideId}`,
          'CLIP_ERROR',
          error,
        );
        appLogger.error(webavError.message, { error, slideId });
        throw webavError;
      }
    },
    [],
  );

  const createAudioClip = useCallback(
    async (audioUrl: string, slideId: string): Promise<AudioClip> => {
      try {
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        const stream = blobToStream(blob);

        const audioClip = new AudioClip(stream, { volume: 1.0 });
        await audioClip.ready;

        appLogger.info(`🎵 Created audio clip for slide ${slideId}`, {
          duration: audioClip.meta.duration,
          channels: audioClip.meta.chanCount,
        });

        return audioClip;
      } catch (error) {
        const webavError = new WebAVError(
          `Failed to create audio clip for slide ${slideId}`,
          'CLIP_ERROR',
          error,
        );
        appLogger.error(webavError.message, { error, slideId });
        throw webavError;
      }
    },
    [],
  );

  const createSlideSprites = useCallback(
    async (slide: WebAVSlideConfig): Promise<{
      imageSprite: EnrichedSprite;
      audioSprite: EnrichedSprite;
    }> => {
      appLogger.info(`📦 Creating sprites for slide ${slide.id}`, {
        duration: slide.duration,
        offset: slide.offset,
      });

      const [imageClip, audioClip] = await Promise.all([
        createImageClip(slide.imageUrl, slide.id),
        createAudioClip(slide.audioUrl, slide.id),
      ]);

      // Image sprite (visual)
      const imageSprite = new OffscreenSprite(imageClip);
      imageSprite.time = {
        offset: slide.offset,
        duration: slide.duration,
      };
      // OffscreenSprite não suporta rect assignment direto, usar propriedades individuais
      (imageSprite as any).rect = {
        x: 0,
        y: 0,
        w: config.width,
        h: config.height,
      };
      imageSprite.zIndex = slide.zIndex ?? 1;

      // Audio sprite
      const audioSprite = new OffscreenSprite(audioClip);
      audioSprite.time = {
        offset: slide.offset,
        duration: slide.duration,
      };

      return {
        imageSprite: {
          sprite: imageSprite,
          clip: imageClip,
          slideId: slide.id,
          metadata: {
            duration: slide.duration,
            width: config.width,
            height: config.height,
            hasAudio: false,
            hasVideo: true,
          },
        },
        audioSprite: {
          sprite: audioSprite,
          clip: audioClip,
          slideId: slide.id,
          metadata: {
            duration: audioClip.meta.duration,
            width: 0,
            height: 0,
            hasAudio: true,
            hasVideo: false,
          },
        },
      };
    },
    [config.width, config.height, createImageClip, createAudioClip],
  );

  const render = useCallback(
    async (slides: WebAVSlideConfig[]): Promise<RenderResult> => {
      if (!capabilities.supported) {
        const error = new WebAVError(
          'WebCodecs not supported in this browser. Use Chrome 102+ or Edge.',
          'NOT_SUPPORTED',
          { capabilities },
        );
        onError?.(error);
        throw error;
      }

      if (isRendering) {
        throw new WebAVError(
          'Render already in progress',
          'RENDER_ERROR',
        );
      }

      setIsRendering(true);
      setProgress(0);
      abortControllerRef.current = new AbortController();

      appLogger.info('🎬 Starting WebAV render', {
        slideCount: slides.length,
        config,
      });

      try {
        onProgress?.({
          progress: 0.1,
          status: 'Creating sprites...',
        });

        // Criar todos os sprites (paralelo para performance)
        const allSprites = await Promise.all(
          slides.map((slide) => createSlideSprites(slide)),
        );

        setProgress(0.3);
        onProgress?.({
          progress: 0.3,
          status: 'Initializing combinator...',
        });

        // Criar combinator
        const combinator = new Combinator({
          width: config.width,
          height: config.height,
          bitrate: config.videoBitrate ?? 5_000_000,
        });

        // Adicionar sprites ao combinator
        let addedCount = 0;
        for (const { imageSprite, audioSprite } of allSprites) {
          if (abortControllerRef.current?.signal.aborted) {
            throw new WebAVError('Render cancelled by user', 'RENDER_ERROR');
          }

          await combinator.addSprite(imageSprite.sprite);
          await combinator.addSprite(audioSprite.sprite);

          addedCount++;
          const addProgress = 0.3 + (addedCount / slides.length) * 0.2;
          setProgress(addProgress);
          onProgress?.({
            progress: addProgress,
            status: `Added slide ${addedCount}/${slides.length}`,
          });
        }

        setProgress(0.6);
        onProgress?.({
          progress: 0.6,
          status: 'Encoding video...',
        });

        // Gerar output stream
        const outputStream = combinator.output();
        
        // Consumir stream e criar blob
        const chunks: Uint8Array[] = [];
        const reader = outputStream.getReader();

        let readProgress = 0.6;
        while (true) {
          if (abortControllerRef.current?.signal.aborted) {
            reader.cancel();
            throw new WebAVError('Render cancelled by user', 'RENDER_ERROR');
          }

          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          readProgress += 0.004; // Incremento gradual
          setProgress(Math.min(readProgress, 0.95));
          onProgress?.({
            progress: Math.min(readProgress, 0.95),
            status: 'Encoding video...',
          });
        }

        const blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);

        const totalDuration = calculateTotalDuration(
          slides.map((s) => s.duration),
        );

        setProgress(1);
        onProgress?.({
          progress: 1,
          status: 'Complete!',
        });

        appLogger.info('✅ WebAV render complete', {
          duration: totalDuration,
          size: blob.size,
          blobUrl,
        });

        const result: RenderResult = {
          stream: blobToStream(blob),
          duration: totalDuration,
          size: blob.size,
          blobUrl,
        };

        setIsRendering(false);
        return result;
      } catch (error) {
        const webavError =
          error instanceof WebAVError
            ? error
            : new WebAVError(
                'Unexpected render error',
                'RENDER_ERROR',
                error,
              );

        appLogger.error('❌ WebAV render failed', {
          error: webavError,
        });

        onError?.(webavError);
        setIsRendering(false);
        setProgress(0);
        throw webavError;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [
      capabilities,
      config,
      createSlideSprites,
      isRendering,
      onError,
      onProgress,
    ],
  );

  return {
    render,
    cancel,
    isRendering,
    progress,
    capabilities,
  };
}
