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
  calculateTotalDuration,
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
    async (imageUrl: string | null | undefined, slideId: string): Promise<ImgClip> => {
      try {
        let imageBitmap: ImageBitmap;

        if (imageUrl) {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          imageBitmap = await createImageBitmap(blob);
        } else {
          imageBitmap = await createPlaceholderImageBitmap(
            config.width,
            config.height,
            slideId,
          );
        }

        const imgClip = new ImgClip(imageBitmap);
        await imgClip.ready;

        appLogger.info(`🖼️ Created image clip for slide ${slideId}`, {
          width: imageBitmap.width,
          height: imageBitmap.height,
        });

        return imgClip;
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
    [config.height, config.width],
  );

  const createAudioClip = useCallback(
    async (audioUrl: string | null | undefined, slideId: string): Promise<AudioClip | null> => {
      if (!audioUrl) {
        appLogger.info('🔇 Slide sem áudio — renderizando apenas vídeo', {
          slideId,
        });
        return null;
      }

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
      audioSprite?: EnrichedSprite;
    }> => {
      // Validar valores de entrada
      if (slide.duration <= 0) {
        throw new WebAVError(
          `Invalid duration for slide ${slide.id}: ${slide.duration}`,
          'CLIP_ERROR',
          { slide },
        );
      }
      if (slide.offset < 0) {
        throw new WebAVError(
          `Invalid offset for slide ${slide.id}: ${slide.offset}`,
          'CLIP_ERROR',
          { slide },
        );
      }

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
      // Configurar propriedades rect individualmente (Rect é uma classe, não objeto simples)
      imageSprite.rect.x = 0;
      imageSprite.rect.y = 0;
      imageSprite.rect.w = Math.max(1, config.width);
      imageSprite.rect.h = Math.max(1, config.height);
      imageSprite.zIndex = slide.zIndex ?? 1;

      const result: {
        imageSprite: EnrichedSprite;
        audioSprite?: EnrichedSprite;
      } = {
        imageSprite: {
          sprite: imageSprite,
          clip: imageClip,
          slideId: slide.id,
          metadata: {
            duration: slide.duration,
            width: config.width,
            height: config.height,
            hasAudio: Boolean(audioClip),
            hasVideo: true,
          },
        },
      };

      if (audioClip) {
        const audioSprite = new OffscreenSprite(audioClip);
        audioSprite.time = {
          offset: slide.offset,
          duration: slide.duration,
        };

        result.audioSprite = {
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
        };
      }

      return result;
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

          try {
            appLogger.info(`Adding sprite to combinator`, {
              slideId: imageSprite.slideId,
              rect: {
                x: imageSprite.sprite.rect.x,
                y: imageSprite.sprite.rect.y,
                w: imageSprite.sprite.rect.w,
                h: imageSprite.sprite.rect.h,
              },
              time: imageSprite.sprite.time,
              zIndex: imageSprite.sprite.zIndex,
            });

            await combinator.addSprite(imageSprite.sprite);

            if (audioSprite) {
              await combinator.addSprite(audioSprite.sprite);
            }
          } catch (error) {
            const webavError = new WebAVError(
              `Failed to add sprite for slide ${imageSprite.slideId}`,
              'COMBINATOR_ERROR',
              { error, slideId: imageSprite.slideId },
            );
            appLogger.error(webavError.message, { error, slideId: imageSprite.slideId });
            throw webavError;
          }

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
        const chunks: BlobPart[] = [];
        const reader = outputStream.getReader();

        let readProgress = 0.6;
        while (true) {
          if (abortControllerRef.current?.signal.aborted) {
            reader.cancel();
            throw new WebAVError('Render cancelled by user', 'RENDER_ERROR');
          }

          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            const copy = new Uint8Array(value.length);
            copy.set(value);
            chunks.push(copy.buffer);
          }
          readProgress += 0.004; // Incremento gradual
          setProgress(Math.min(readProgress, 0.95));
          onProgress?.({
            progress: Math.min(readProgress, 0.95),
            status: 'Encoding video...',
          });
        }

        const blob = new Blob(chunks, { type: 'video/mp4' });
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

async function createPlaceholderImageBitmap(
  width: number,
  height: number,
  slideId: string,
): Promise<ImageBitmap> {
  const fallbackWidth = Math.max(1, width || 1920);
  const fallbackHeight = Math.max(1, height || 1080);

  if (
    typeof OffscreenCanvas === 'undefined' &&
    typeof document === 'undefined'
  ) {
    const imageData = new ImageData(fallbackWidth, fallbackHeight);
    return await createImageBitmap(imageData);
  }

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(fallbackWidth, fallbackHeight)
      : (() => {
          const el = document.createElement('canvas');
          el.width = fallbackWidth;
          el.height = fallbackHeight;
          return el;
        })();

  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    const imageData = new ImageData(fallbackWidth, fallbackHeight);
    return await createImageBitmap(imageData);
  }

  const gradient = ctx.createLinearGradient(0, 0, fallbackWidth, fallbackHeight);
  gradient.addColorStop(0, '#111827');
  gradient.addColorStop(1, '#1f2937');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, fallbackWidth, fallbackHeight);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, 0, fallbackWidth, fallbackHeight);

  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(24, fallbackWidth * 0.04)}px "Space Grotesk", sans-serif`;
  ctx.fillText('Slide sem imagem', fallbackWidth / 2, fallbackHeight / 2);

  ctx.font = `${Math.max(16, fallbackWidth * 0.03)}px "Space Mono", monospace`;
  ctx.fillText(`#${slideId}`, fallbackWidth / 2, fallbackHeight / 2 + 48);

  if (canvas instanceof OffscreenCanvas && 'convertToBlob' in canvas) {
    const blob = await canvas.convertToBlob();
    return await createImageBitmap(blob);
  }

  return await new Promise<ImageBitmap>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Failed to create placeholder blob'));
          return;
        }
        const bitmap = await createImageBitmap(blob);
        resolve(bitmap);
      },
      'image/png',
    );
  });
}
