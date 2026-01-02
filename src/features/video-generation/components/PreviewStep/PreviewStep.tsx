import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import JSZip from 'jszip';
import {
  Archive,
  Check,
  Download,
  Film,
  ImageIcon,
  Loader2,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';

import { WebAVRenderer } from './WebAVRenderer';

import { type AspectRatio, VIDEO_CONFIG } from '@/config/constants/video';
import type { RenderBundleManifest } from '@/features/render-test/model/renderBundle';
import type {
  ProjectData,
  Slide,
} from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';
import { dataUrlToBlob } from '@/shared/utils/blob';
import type { WebAVRendererSlideInput } from '@/shared/types/webav.types';

type PreviewStepProps = {
  slides: Slide[];
  aspectRatio: AspectRatio;
  onReset: () => void;
  projectData: Partial<ProjectData>;
  isDebugMode: boolean;
};

type CanvasSurface =
  | {
      kind: 'dom';
      canvas: HTMLCanvasElement;
      context: CanvasRenderingContext2D;
    }
  | {
      kind: 'offscreen';
      canvas: OffscreenCanvas;
      context: OffscreenCanvasRenderingContext2D | null;
    };

type SlideImageSourceMap = Map<Slide['id'], CanvasImageSource | null>;

const FALLBACK_DURATION_MS = 3_000;
const EXPORT_FRAME_RATE = 30;
const RECORDER_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
] as const;

type RecorderMimeType = (typeof RECORDER_MIME_TYPES)[number];

function createCanvasSurface(
  width: number,
  height: number,
): CanvasSurface | null {
  if (typeof document !== 'undefined') {
    const existing = document.getElementById(
      'render-surface',
    ) as HTMLCanvasElement | null;
    const canvas = existing ?? document.createElement('canvas');
    canvas.id = 'render-surface';
    canvas.width = width;
    canvas.height = height;
    canvas.style.position = 'fixed';
    canvas.style.top = '-9999px';
    canvas.style.left = '-9999px';
    canvas.style.opacity = '0';
    canvas.style.pointerEvents = 'none';
    if (!existing && document.body) {
      document.body.appendChild(canvas);
    }
    const context = canvas.getContext('2d');
    if (context) {
      return { kind: 'dom', canvas, context };
    }
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(width, height);
    return {
      kind: 'offscreen',
      canvas: offscreen,
      context: offscreen.getContext('2d'),
    };
  }

  return null;
}
function resolveRecorderMimeType(): RecorderMimeType {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder não é suportado neste navegador.');
  }

  const supported = RECORDER_MIME_TYPES.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate),
  );

  if (!supported) {
    throw new Error('Nenhum formato de vídeo suportado foi encontrado.');
  }

  return supported;
}

export function PreviewStep({
  slides,
  aspectRatio,
  onReset,
  projectData,
  isDebugMode,
}: PreviewStepProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFallbackRendering, setIsFallbackRendering] = useState(false);
  const [isWebAVRendering, setIsWebAVRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [isBundlingAssets, setIsBundlingAssets] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackTimeoutRef = useRef<number | null>(null);
  const isAnyRendering = isFallbackRendering || isWebAVRendering;

  const clearFallbackTimeout = () => {
    if (fallbackTimeoutRef.current !== null) {
      window.clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
  };

  const playCurrentSlideAudio = useCallback(() => {
    audioRef.current?.pause();
    clearFallbackTimeout();
    const slide = slides[currentSlideIndex];

    if (slide.audioBlob) {
      const url = URL.createObjectURL(slide.audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        if (currentSlideIndex < slides.length - 1) {
          setCurrentSlideIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
          setCurrentSlideIndex(0);
        }
      };

      audio.play().catch((error) => {
        appLogger.error('Falha ao reproduzir áudio no preview.', { error });
        setIsPlaying(false);
      });
    } else {
      clearFallbackTimeout();
      fallbackTimeoutRef.current = window.setTimeout(() => {
        if (currentSlideIndex < slides.length - 1) {
          setCurrentSlideIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
        }
      }, FALLBACK_DURATION_MS);
    }
  }, [currentSlideIndex, slides]);

  useEffect(() => {
    if (isPlaying) {
      playCurrentSlideAudio();
    }

    return () => {
      audioRef.current?.pause();
      clearFallbackTimeout();
    };
  }, [isPlaying, playCurrentSlideAudio]);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
    }
  };

  const getResolution = () => {
    const { width, height } = VIDEO_CONFIG.DEFAULT_RESOLUTION;
    if (aspectRatio === '9:16') return [height, width] as const;
    if (aspectRatio === '1:1')
      return [Math.min(width, height), Math.min(width, height)] as const;
    return [width, height] as const;
  };

  const handleDownloadVideo = async () => {
    appLogger.info('🎬 Iniciando exportação de vídeo.', {
      slides: slides.length,
      aspectRatio,
    });

    if (hasVideoAssets) {
      window.alert(
        'O exportador via MediaRecorder não suporta slides com vídeos enviados. Utilize o renderizador WebAV.',
      );
      return;
    }

    const startedAt = performance.now();
    setIsFallbackRendering(true);
    setRenderProgress(0);

    let slideImageSources: SlideImageSourceMap | null = null;

    try {
      slideImageSources = await preloadSlideImageSources(slides);
      if (!slideImageSources) {
        throw new Error('Não foi possível preparar as imagens dos slides.');
      }
      const [width, height] = getResolution();
      const surface = createCanvasSurface(width, height);

      if (!surface || !surface.context) {
        throw new Error('Não foi possível criar um canvas para renderização.');
      }

      if (surface.kind !== 'dom') {
        appLogger.warn('🚫 Exportação indisponível: canvas DOM não suportado.');
        window.alert(
          'Seu navegador não suporta captura de tela para exportar vídeo. Tente no Chrome ou Edge.',
        );
        return;
      }

      const canvas = surface.canvas;
      const ctx = surface.context;

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('API de áudio não suportada neste navegador.');
      }
      const audioCtx = new AudioContextCtor();
      const dest = audioCtx.createMediaStreamDestination();

      if (typeof canvas.captureStream !== 'function') {
        throw new Error('Seu navegador não suporta captura de canvas.');
      }

      const stream = canvas.captureStream(EXPORT_FRAME_RATE);
      const canvasTrack = stream.getVideoTracks()[0];
      const canForceFrame = Boolean(
        canvasTrack && 'requestFrame' in canvasTrack,
      );

      if (!canvasTrack) {
        appLogger.warn('🪟 Track de vídeo indisponível na stream de captura.');
      } else if (canForceFrame) {
        appLogger.info('🖼️ Track do canvas suporta requestFrame.', {
          frameRate: EXPORT_FRAME_RATE,
        });
      } else {
        appLogger.info('ℹ️ Track sem requestFrame; confiando no RAF.', {
          frameRate: EXPORT_FRAME_RATE,
        });
      }

      const requestCanvasFrame = () => {
        if (canForceFrame && canvasTrack) {
          (canvasTrack as CanvasCaptureMediaStreamTrack).requestFrame();
        }
      };

      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
        stream.addTrack(audioTrack);
      }

      const mimeType = resolveRecorderMimeType();

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const stopPromise = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = (event) => {
          reject(
            event.error ??
              new Error('Erro no MediaRecorder durante a exportação.'),
          );
        };
      });

      recorder.start();

      for (let index = 0; index < slides.length; index += 1) {
        const slide = slides[index];
        setRenderProgress(Math.round(((index + 1) / slides.length) * 100));

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const slideImageSource = slideImageSources.get(slide.id) ?? null;

        if (slideImageSource) {
          drawImageCover(ctx, slideImageSource, width, height);
        } else {
          drawFallbackBackground(ctx, width, height);
        }
        requestCanvasFrame();
        await waitNextFrame();

        if (slide.audioBlob) {
          const arrayBuffer = await slide.audioBlob.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(dest);
          source.start();
          await wait(audioBuffer.duration * 1000);
        } else {
          await wait(FALLBACK_DURATION_MS);
        }
      }

      setRenderProgress(100);

      requestCanvasFrame();
      await waitNextFrame();
      recorder.stop();
      await stopPromise;

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `eduscript_video.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
      if (document.body) {
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } else {
        appLogger.warn(
          '⚠️ document.body ausente; usando fallback de download.',
        );
        window.open(url, '_blank', 'noopener');
      }
      URL.revokeObjectURL(url);
      audioCtx.close();

      appLogger.info('✅ Vídeo exportado com sucesso.', {
        mimeType,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      appLogger.error('Falha ao renderizar o vídeo final.', { error });
      window.alert(
        'Não foi possível renderizar o vídeo. Verifique o console para mais detalhes.',
      );
    } finally {
      cleanupSlideImageSources(slideImageSources);
      setIsFallbackRendering(false);
      setRenderProgress(0);
    }
  };

  const handleDownloadDebugBundle = async () => {
    if (isBundlingAssets) {
      return;
    }

    setIsBundlingAssets(true);

    try {
      const zip = new JSZip();
      const imagesDir = zip.folder('assets/images');
      const audioDir = zip.folder('assets/audio');
      const customDir = zip.folder('assets/custom');

      const manifest: RenderBundleManifest = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        aspectRatio,
        project: {
          topic: projectData.topic,
          materials: projectData.materials,
          targetAudience: projectData.targetAudience,
          promptId: projectData.promptId,
        },
        slides: [],
      };

      for (let index = 0; index < slides.length; index += 1) {
        const slide = slides[index];
        let imageFileName: string | null = null;
        let audioFileName: string | null = null;
        let assetFileName: string | null = null;

        if (slide.imageUrl) {
          try {
            const imageBlob = await fetchImageBlob(slide.imageUrl);
            const extension = inferExtensionFromMime(imageBlob.type, 'png');
            imageFileName = `slide-${formatSlideIndex(index)}.${extension}`;
            imagesDir?.file(imageFileName, imageBlob, { binary: true });
          } catch (error) {
            appLogger.error('🖼️ Falha ao anexar imagem ao bundle.', {
              error,
              slideId: slide.id,
            });
          }
        }

        if (slide.customAsset?.type === 'image') {
          assetFileName = imageFileName;
        }

        if (slide.audioBlob) {
          audioFileName = `slide-${formatSlideIndex(index)}.${inferExtensionFromMime(slide.audioBlob.type, 'webm')}`;
          audioDir?.file(audioFileName, slide.audioBlob, { binary: true });
        }

        if (slide.customAsset?.type === 'video') {
          try {
            const videoBlob =
              slide.customAsset.file ??
              (slide.customAsset.sourceUrl
                ? await fetch(slide.customAsset.sourceUrl).then((response) => response.blob())
                : null);
            if (videoBlob) {
              const extension = inferExtensionFromMime(videoBlob.type, 'mp4');
              assetFileName = `slide-${formatSlideIndex(index)}.${extension}`;
              customDir?.file(assetFileName, videoBlob, { binary: true });
            }
          } catch (error) {
            appLogger.error('🎞️ Falha ao anexar vídeo personalizado ao bundle.', {
              error,
              slideId: slide.id,
            });
          }
        }

        manifest.slides.push({
          id: slide.id,
          order: slide.order,
          scriptText: slide.scriptText,
          narrationText: slide.narrationText,
          visualPrompt: slide.visualPrompt,
          imageFile: imageFileName,
          audioFile: audioFileName,
          assetFile: assetFileName,
          assetType: slide.customAsset?.type ?? null,
          assetDurationMs: slide.customAsset?.durationMs ?? null,
        });
      }

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `eduscript_bundle_${Date.now()}.zip`);

      appLogger.info('📦 Bundle de depuração exportado.', {
        slides: manifest.slides.length,
      });
    } catch (error) {
      appLogger.error('Falha ao exportar bundle de depuração.', { error });
      window.alert(
        'Não foi possível gerar o bundle de depuração. Consulte o console para detalhes.',
      );
    } finally {
      setIsBundlingAssets(false);
    }
  };

  const webAvSlides = useMemo<WebAVRendererSlideInput[]>(() => {
    return slides.map((slide, index) => {
      const asset = slide.customAsset;
      const visualAsset = (() => {
        if (!asset) {
          return undefined;
        }

        const baseUrl = asset.sourceUrl ?? asset.previewUrl;
        if (!baseUrl) {
          return undefined;
        }

        if (asset.type === 'video') {
          return {
            kind: 'video' as const,
            url: baseUrl,
            file: asset.file,
            durationSeconds:
              typeof asset.durationMs === 'number'
                ? asset.durationMs / 1000
                : undefined,
          };
        }

        return {
          kind: 'image' as const,
          url: baseUrl,
        };
      })();

      return {
        id: slide.id,
        order: slide.order ?? index,
        imageUrl: slide.imageUrl ?? undefined,
        audioBlob: slide.audioBlob ?? undefined,
        zIndex: 1,
        visualAsset,
      };
    });
  }, [slides]);

  const currentSlide = slides[currentSlideIndex];
  const hasVideoAssets = useMemo(
    () => slides.some((slide) => slide.customAsset?.type === 'video'),
    [slides],
  );

  const resolveSlideVisual = (slide: Slide) => {
    const asset = slide.customAsset;
    if (asset?.type === 'video' && asset.previewUrl) {
      return { type: 'video' as const, url: asset.previewUrl };
    }
    if (asset?.type === 'image' && asset.previewUrl) {
      return { type: 'image' as const, url: asset.previewUrl };
    }
    if (slide.imageUrl) {
      return { type: 'image' as const, url: slide.imageUrl };
    }
    return null;
  };

  if (!currentSlide) {
    return null;
  }

  const arClass =
    aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-[65vh]'
      : aspectRatio === '16:9'
        ? 'aspect-[16/9] max-w-[70vw]'
        : 'aspect-square max-h-[65vh]';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 pt-14">
      {/* Rendering overlay (fallback MediaRecorder) */}
      {isFallbackRendering && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-dark-950/95 backdrop-blur-sm">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary-500/30" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary-500/20">
              <Film size={36} className="animate-pulse text-primary-400" />
            </div>
          </div>
          <div className="text-center">
            <p className="mb-2 text-xl font-semibold text-white">
              Renderizando vídeo...
            </p>
            <p className="text-sm text-white/50">
              Processando {slides.length} slides
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
        </div>
      )}

      {/* Header info */}
      <div className="glass-card flex items-center gap-4 rounded-xl px-5 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-500/20">
          <Check size={20} className="text-success-400" />
        </div>
        <div>
          <p className="font-semibold text-white">Projeto finalizado!</p>
          <p className="text-sm text-white/50">
            {slides.length} slides prontos para exportação
          </p>
        </div>
      </div>

      {/* Video preview */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl ${arClass}`}
      >
        {(() => {
          const visual = resolveSlideVisual(currentSlide);
          if (!visual) {
            return (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/40">
                <ImageIcon size={40} />
                <span className="text-sm">Sem visual</span>
              </div>
            );
          }

          if (visual.type === 'video') {
            return (
              <video
                key={visual.url}
                src={visual.url}
                className="h-full w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            );
          }

          return (
            <img
              src={visual.url}
              alt="Slide atual"
              className="h-full w-full object-cover"
            />
          );
        })()}

        {/* Subtitle */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-6">
          <p className="text-center text-lg leading-relaxed text-white drop-shadow-lg">
            {currentSlide.narrationText}
          </p>
        </div>

        {/* Slide indicator */}
        <div className="absolute left-4 top-4 rounded-full bg-dark-900/80 px-3 py-1 text-xs font-medium text-white/70 backdrop-blur-sm">
          {currentSlideIndex + 1} / {slides.length}
        </div>

        {/* Playing indicator */}
        {isPlaying && (
          <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-primary-500/90 px-3 py-1 text-xs font-medium text-white">
            <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
            Reproduzindo
          </div>
        )}
      </div>

      {/* Slide thumbnails */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-xl bg-dark-800/50 p-2">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => setCurrentSlideIndex(index)}
            className={`relative flex-shrink-0 overflow-hidden rounded-lg transition-all duration-200 ${
              index === currentSlideIndex
                ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-dark-900'
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            <div className="h-10 w-14 bg-dark-800">
              {(() => {
                const visual = resolveSlideVisual(slide);
                if (!visual) {
                  return null;
                }
                if (visual.type === 'video') {
                  return (
                    <video
                      key={visual.url}
                      src={visual.url}
                      className="h-full w-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  );
                }
                return (
                  <img
                    src={visual.url}
                    alt={`Slide ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                );
              })()}
            </div>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onReset}
          disabled={isAnyRendering}
          className="btn-icon"
          title="Reiniciar projeto"
        >
          <RotateCcw size={20} />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          disabled={isAnyRendering}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-dark-900 shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl disabled:opacity-50"
        >
          {isPlaying ? (
            <Pause size={24} />
          ) : (
            <Play size={24} className="ml-1" />
          )}
        </button>

        {/* WebAV Renderer (GPU-accelerated) */}
        <WebAVRenderer
          slides={webAvSlides}
          aspectRatio={aspectRatio}
          isRendering={isWebAVRendering}
          onRenderStart={() => setIsWebAVRendering(true)}
          onRenderComplete={() => setIsWebAVRendering(false)}
          onRenderError={(error) => {
            setIsWebAVRendering(false);
            window.alert(
              `Falha na renderização: ${error.message}\n\nTente usar o fallback abaixo.`
            );
          }}
        />

        {/* Fallback: Legacy MediaRecorder */}
        <button
          type="button"
          onClick={handleDownloadVideo}
          disabled={isAnyRendering || hasVideoAssets}
          className="btn-secondary px-6 disabled:cursor-not-allowed"
          title={
            hasVideoAssets
              ? 'Slides com vídeo enviado devem usar o renderizador WebAV.'
              : 'Exportar com MediaRecorder (fallback)'
          }
        >
          {hasVideoAssets ? (
            <>
              <Film size={20} />
              Indisponível para vídeos
            </>
          ) : isFallbackRendering ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Exportando...
            </>
          ) : (
            <>
              <Download size={20} />
              Fallback (MediaRecorder)
            </>
          )}
        </button>

        {isDebugMode && (
          <button
            type="button"
            onClick={handleDownloadDebugBundle}
            disabled={isAnyRendering || isBundlingAssets}
            className="btn-secondary px-6"
          >
            {isBundlingAssets ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Preparando bundle
              </>
            ) : (
              <>
                <Archive size={20} /> Bundle debug
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
) {
  const { intrinsicWidth, intrinsicHeight } = getSourceDimensions(source, {
    fallbackWidth: width,
    fallbackHeight: height,
  });
  const scale = Math.max(width / intrinsicWidth, height / intrinsicHeight);
  const x = width / 2 - (intrinsicWidth / 2) * scale;
  const y = height / 2 - (intrinsicHeight / 2) * scale;
  ctx.drawImage(source, x, y, intrinsicWidth * scale, intrinsicHeight * scale);
}

function drawFallbackBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#111827');
  gradient.addColorStop(1, '#1f2937');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, 0, width, height);
}

function getSourceDimensions(
  source: CanvasImageSource,
  fallback: { fallbackWidth: number; fallbackHeight: number },
) {
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return { intrinsicWidth: source.width, intrinsicHeight: source.height };
  }
  if (source instanceof HTMLImageElement) {
    return {
      intrinsicWidth:
        source.naturalWidth || source.width || fallback.fallbackWidth,
      intrinsicHeight:
        source.naturalHeight || source.height || fallback.fallbackHeight,
    };
  }
  if (source instanceof HTMLCanvasElement) {
    return { intrinsicWidth: source.width, intrinsicHeight: source.height };
  }

  return {
    intrinsicWidth: fallback.fallbackWidth,
    intrinsicHeight: fallback.fallbackHeight,
  };
}

async function preloadSlideImageSources(
  slides: Slide[],
): Promise<SlideImageSourceMap> {
  const entries = await Promise.all(
    slides.map(async (slide) => {
      if (!slide.imageUrl) {
        return [slide.id, null] as const;
      }

      try {
        const source = await loadCanvasImageSource(slide.imageUrl);
        return [slide.id, source] as const;
      } catch (error) {
        appLogger.warn('⚠️ Falha ao preparar imagem para renderização.', {
          slideId: slide.id,
          error,
        });
        return [slide.id, null] as const;
      }
    }),
  );

  return new Map(entries);
}

function cleanupSlideImageSources(map: SlideImageSourceMap | null) {
  if (!map || typeof ImageBitmap === 'undefined') {
    return;
  }

  map.forEach((source) => {
    if (source instanceof ImageBitmap) {
      source.close();
    }
  });
}

async function loadCanvasImageSource(url: string): Promise<CanvasImageSource> {
  const blob = await fetchImageBlob(url);

  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob);
  }

  return await blobToImageElement(blob);
}

async function fetchImageBlob(url: string): Promise<Blob> {
  if (isDataUrl(url)) {
    return dataUrlToBlob(url);
  }

  const response = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`Não foi possível carregar a imagem (${response.status}).`);
  }

  return await response.blob();
}

async function blobToImageElement(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadImageFromUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (event) => reject(event);
    img.src = url;
  });
}

function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

function wait(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function waitNextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

function inferExtensionFromMime(mime: string | undefined, fallback: string) {
  if (!mime) {
    return fallback;
  }
  const [, subtype] = mime.split('/');
  if (!subtype) {
    return fallback;
  }
  const cleanSubtype = subtype.split(';')[0]?.trim();
  return cleanSubtype || fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatSlideIndex(index: number) {
  return String(index + 1).padStart(2, '0');
}
