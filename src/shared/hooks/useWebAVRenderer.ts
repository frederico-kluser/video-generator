/**
 * Hook principal para renderização de vídeo com WebAV.
 * Gerencia o ciclo completo: criar sprites → combinar → exportar MP4.
 */

import { useCallback, useRef, useState } from 'react';
import {
  AudioClip,
  Combinator,
  ImgClip,
  MP4Clip,
  OffscreenSprite,
} from '@webav/av-cliper';
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

  const captureLastFrameFromBlob = useCallback(
    async (blob: Blob, slideId: string): Promise<ImageBitmap | null> => {
      if (typeof document === 'undefined' || typeof window === 'undefined') {
        return null;
      }

      return await new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';

        const objectUrl = URL.createObjectURL(blob);
        let settled = false;
        let timeoutId: number | undefined;

        const finalize = (bitmap: ImageBitmap | null) => {
          if (settled) {
            return;
          }
          settled = true;
          if (typeof timeoutId === 'number') {
            window.clearTimeout(timeoutId);
          }
          video.pause();
          video.src = '';
          video.remove();
          URL.revokeObjectURL(objectUrl);
          resolve(bitmap);
        };

        const fail = (reason: unknown) => {
          appLogger.warn('⚠️ Falha ao capturar frame final do vídeo.', {
            slideId,
            reason,
          });
          finalize(null);
        };

        timeoutId = window.setTimeout(() => fail('timeout'), 8000);

        video.onloadedmetadata = () => {
          const duration = Number.isFinite(video.duration)
            ? Math.max(0, video.duration - 0.05)
            : 0;
          video.currentTime = duration;
        };

        video.onseeked = async () => {
          try {
            const targetWidth = video.videoWidth || config.width;
            const targetHeight = video.videoHeight || config.height;

            if (targetWidth <= 0 || targetHeight <= 0) {
              throw new Error('invalid-video-dimensions');
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              throw new Error('canvas-context-missing');
            }
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

            const canvasBlob: Blob = await new Promise((resolveBlob, rejectBlob) => {
              canvas.toBlob(
                (blobResult) => {
                  if (blobResult) {
                    resolveBlob(blobResult);
                  } else {
                    rejectBlob(new Error('toBlob-failed'));
                  }
                },
                'image/png',
              );
            });

            const bitmap = await createImageBitmap(canvasBlob);
            finalize(bitmap);
          } catch (error) {
            fail(error);
          }
        };

        video.onerror = () => fail('video-error');
        video.src = objectUrl;
        video.load();
      });
    },
    [config.height, config.width],
  );

  const createVideoVisualSprites = useCallback(
    async (slide: WebAVSlideConfig): Promise<EnrichedSprite[] | null> => {
      if (!slide.visualAsset || slide.visualAsset.kind !== 'video') {
        return null;
      }

      try {
        let blobSource: Blob | null = null;

        if (slide.visualAsset.file instanceof Blob) {
          blobSource = slide.visualAsset.file;
        } else if (slide.visualAsset.url) {
          const response = await fetch(slide.visualAsset.url);
          if (!response.ok) {
            throw new Error(
              `Failed to carregar vídeo personalizado (${response.status}).`,
            );
          }
          blobSource = await response.blob();
        }

        if (!blobSource) {
          throw new Error('Slide sem referência para vídeo personalizado.');
        }

        const clip = new MP4Clip(blobSource.stream(), { audio: false });
        await clip.ready;

        appLogger.info('🎞️ Vídeo personalizado preparado para renderização.', {
          slideId: slide.id,
          duration: clip.meta.duration,
          width: clip.meta.width,
          height: clip.meta.height,
        });

        const videoDuration = slide.videoPlayback?.videoDuration ?? slide.duration;
        const freezeDuration = Math.max(0, slide.videoPlayback?.freezeFrameFor ?? 0);

        const sprites: EnrichedSprite[] = [];
        const videoSprite = new OffscreenSprite(clip);
        videoSprite.time = {
          offset: slide.offset,
          duration: videoDuration,
        };
        videoSprite.rect.x = 0;
        videoSprite.rect.y = 0;
        videoSprite.rect.w = Math.max(1, config.width);
        videoSprite.rect.h = Math.max(1, config.height);
        videoSprite.zIndex = slide.zIndex ?? 1;

        sprites.push({
          sprite: videoSprite,
          clip,
          slideId: `${slide.id}::video`,
          metadata: {
            duration: videoDuration,
            width: clip.meta.width || config.width,
            height: clip.meta.height || config.height,
            hasAudio: false,
            hasVideo: true,
          },
        });

        if (freezeDuration > 0) {
          const freezeBitmap = await captureLastFrameFromBlob(blobSource, slide.id);
          if (freezeBitmap) {
            const freezeClip = new ImgClip(freezeBitmap);
            await freezeClip.ready;
            const freezeSprite = new OffscreenSprite(freezeClip);
            freezeSprite.time = {
              offset: slide.offset + videoDuration,
              duration: freezeDuration,
            };
            freezeSprite.rect.x = 0;
            freezeSprite.rect.y = 0;
            freezeSprite.rect.w = Math.max(1, config.width);
            freezeSprite.rect.h = Math.max(1, config.height);
            freezeSprite.zIndex = videoSprite.zIndex;

            sprites.push({
              sprite: freezeSprite,
              clip: freezeClip,
              slideId: `${slide.id}::freeze`,
              metadata: {
                duration: freezeDuration,
                width: config.width,
                height: config.height,
                hasAudio: false,
                hasVideo: true,
              },
            });
          } else {
            appLogger.warn('⚠️ Freeze frame indisponível para vídeo customizado.', {
              slideId: slide.id,
            });
          }
        }

        return sprites;
      } catch (error) {
        appLogger.error('💥 Falha ao preparar vídeo personalizado para WebAV.', {
          slideId: slide.id,
          error,
        });
        return null;
      }
    },
    [captureLastFrameFromBlob, config.height, config.width],
  );

  const createSlideSprites = useCallback(
    async (slide: WebAVSlideConfig): Promise<{
      slideId: string;
      visualSprites: EnrichedSprite[];
      audioSprite?: EnrichedSprite;
    }> => {
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

      const [videoSprites, audioClip] = await Promise.all([
        slide.visualAsset?.kind === 'video'
          ? createVideoVisualSprites(slide)
          : null,
        createAudioClip(slide.audioUrl, slide.id),
      ]);

      let visualSprites =
        videoSprites && videoSprites.length > 0 ? videoSprites : undefined;

      if (!visualSprites) {
        const preferredImageUrl =
          slide.visualAsset?.kind === 'image'
            ? slide.visualAsset.url
            : slide.imageUrl;
        const imageClip = await createImageClip(preferredImageUrl, slide.id);
        const imageSprite = new OffscreenSprite(imageClip);
        imageSprite.time = {
          offset: slide.offset,
          duration: slide.duration,
        };
        imageSprite.rect.x = 0;
        imageSprite.rect.y = 0;
        imageSprite.rect.w = Math.max(1, config.width);
        imageSprite.rect.h = Math.max(1, config.height);
        imageSprite.zIndex = slide.zIndex ?? 1;

        visualSprites = [
          {
            sprite: imageSprite,
            clip: imageClip,
            slideId: `${slide.id}::image`,
            metadata: {
              duration: slide.duration,
              width: config.width,
              height: config.height,
              hasAudio: Boolean(audioClip),
              hasVideo: true,
            },
          },
        ];
      }

      let audioSprite: EnrichedSprite | undefined;
      if (audioClip) {
        const audioSpriteInstance = new OffscreenSprite(audioClip);
        audioSpriteInstance.time = {
          offset: slide.offset,
          duration: slide.duration,
        };

        audioSprite = {
          sprite: audioSpriteInstance,
          clip: audioClip,
          slideId: `${slide.id}::audio`,
          metadata: {
            duration: audioClip.meta.duration,
            width: 0,
            height: 0,
            hasAudio: true,
            hasVideo: false,
          },
        };
      }

      return {
        slideId: slide.id,
        visualSprites,
        audioSprite,
      };
    },
    [
      config.width,
      config.height,
      createAudioClip,
      createImageClip,
      createVideoVisualSprites,
    ],
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
        for (const { slideId, visualSprites, audioSprite } of allSprites) {
          if (abortControllerRef.current?.signal.aborted) {
            throw new WebAVError('Render cancelled by user', 'RENDER_ERROR');
          }

          for (const visual of visualSprites) {
            try {
              appLogger.info(`Adding sprite to combinator`, {
                slideId: visual.slideId ?? slideId,
                rect: {
                  x: visual.sprite.rect.x,
                  y: visual.sprite.rect.y,
                  w: visual.sprite.rect.w,
                  h: visual.sprite.rect.h,
                },
                time: visual.sprite.time,
                zIndex: visual.sprite.zIndex,
              });

              await combinator.addSprite(visual.sprite);
            } catch (error) {
              const webavError = new WebAVError(
                `Failed to add sprite for slide ${slideId}`,
                'COMBINATOR_ERROR',
                { error, slideId },
              );
              appLogger.error(webavError.message, { error, slideId });
              throw webavError;
            }
          }

          if (audioSprite) {
            try {
              await combinator.addSprite(audioSprite.sprite);
            } catch (error) {
              const webavError = new WebAVError(
                `Failed to add audio sprite for slide ${slideId}`,
                'COMBINATOR_ERROR',
                { error, slideId },
              );
              appLogger.error(webavError.message, { error, slideId });
              throw webavError;
            }
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
