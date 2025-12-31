import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Pause, Play, RotateCcw } from 'lucide-react';

import { type AspectRatio, VIDEO_CONFIG } from '@/config/constants/video';
import type { Slide } from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';

type PreviewStepProps = {
  slides: Slide[];
  aspectRatio: AspectRatio;
  onReset: () => void;
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

const FALLBACK_DURATION_MS = 3_000;

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
    canvas.style.display = 'none';
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

export function PreviewStep({
  slides,
  aspectRatio,
  onReset,
}: PreviewStepProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackTimeoutRef = useRef<number | null>(null);

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
    if (aspectRatio === '9:16') return [720, 1280] as const;
    if (aspectRatio === '1:1') return [1080, 1080] as const;
    return [1280, 720] as const;
  };

  const handleDownloadVideo = async () => {
    setIsRendering(true);
    setRenderProgress(0);

    try {
      const [width, height] = getResolution();
      const surface = createCanvasSurface(width, height);

      if (!surface || !surface.context) {
        throw new Error('Não foi possível criar um canvas para renderização.');
      }

      if (surface.kind !== 'dom') {
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

      const stream = canvas.captureStream(30);
      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
        stream.addTrack(audioTrack);
      }

      const mimeType = MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';

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

      recorder.start();

      for (let index = 0; index < slides.length; index += 1) {
        const slide = slides[index];
        setRenderProgress(Math.round((index / slides.length) * 100));

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        if (slide.imageUrl) {
          const imageElement = await createImageElement(slide.imageUrl);
          drawImageCover(ctx, imageElement, width, height);
        }

        drawSubtitle(ctx, slide.scriptText, width, height);

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

      recorder.stop();
      await new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `eduscript_video.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
      document.body?.appendChild(anchor);
      anchor.click();
      document.body?.removeChild(anchor);
      URL.revokeObjectURL(url);
      audioCtx.close();
    } catch (error) {
      appLogger.error('Falha ao renderizar o vídeo final.', { error });
      window.alert(
        'Não foi possível renderizar o vídeo. Verifique o console para mais detalhes.',
      );
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
    }
  };

  const currentSlide = slides[currentSlideIndex];

  if (!currentSlide) {
    return null;
  }

  const arClass =
    aspectRatio === '9:16'
      ? 'aspect-[9/16] h-[70vh]'
      : aspectRatio === '16:9'
        ? 'aspect-[16/9] w-[80vw]'
        : 'aspect-square h-[70vh]';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-950 p-6">
      {isRendering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
          <span className="text-4xl text-blue-400">⏳</span>
          <p className="text-xl font-semibold text-white">
            Renderizando vídeo...
          </p>
          <div className="h-2 w-64 rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${renderProgress}%` }}
            />
          </div>
        </div>
      )}

      <div
        className={`relative overflow-hidden rounded-2xl border border-gray-800 bg-black shadow-2xl ${arClass}`}
      >
        {currentSlide.imageUrl ? (
          <img
            src={currentSlide.imageUrl}
            alt="Slide atual"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-500">
            Sem imagem
          </div>
        )}
        <div className="absolute bottom-8 left-0 right-0 px-8 text-center">
          <span className="rounded bg-black/60 px-3 py-2 text-lg text-white">
            {currentSlide.scriptText}
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onReset}
          disabled={isRendering}
          className="rounded-full bg-gray-800 p-4 text-gray-300 transition hover:bg-gray-700 disabled:opacity-50"
        >
          <RotateCcw />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          disabled={isRendering}
          className="rounded-full bg-white p-4 text-black transition hover:bg-gray-200 disabled:opacity-50"
        >
          {isPlaying ? <Pause /> : <Play />}
        </button>
        <button
          type="button"
          onClick={handleDownloadVideo}
          disabled={isRendering}
          className="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-4 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          <Download size={20} />
          Exportar vídeo
        </button>
      </div>
    </div>
  );
}

async function createImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (event) => reject(event);
    img.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / img.width, height / img.height);
  const x = width / 2 - (img.width / 2) * scale;
  const y = height / 2 - (img.height / 2) * scale;
  ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  const fontSize = Math.floor(height * 0.05);
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const lines = wrapText(ctx, text, width * 0.85);
  const blockHeight = lines.length * fontSize * 1.2;
  const startY = height - blockHeight - height * 0.05;

  ctx.fillRect(0, startY - 20, width, blockHeight + 40);
  ctx.fillStyle = '#fff';
  lines.forEach((line, index) => {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    const yPosition = startY + index * fontSize * 1.2;
    ctx.strokeText(line, width / 2, yPosition);
    ctx.fillText(line, width / 2, yPosition);
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const prospectiveLine = `${currentLine}${word} `;
    if (ctx.measureText(prospectiveLine).width > maxWidth && currentLine) {
      lines.push(currentLine.trim());
      currentLine = `${word} `;
    } else {
      currentLine = prospectiveLine;
    }
  }

  lines.push(currentLine.trim());
  return lines;
}

function wait(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
