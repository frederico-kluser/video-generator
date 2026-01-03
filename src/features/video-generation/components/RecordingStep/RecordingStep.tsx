import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ImageIcon,
  Mic,
  MicOff,
  Pause,
  Play,
  Trash2,
  Volume2,
} from 'lucide-react';

import { type AspectRatio } from '@/config/constants/video';
import type { Slide } from '@/features/video-generation/model/types';
import { appLogger } from '@/shared/logging/logger';

type RecordingStepProps = {
  slides: Slide[];
  aspectRatio: AspectRatio;
  onUpdateSlide: (id: string, updates: Partial<Slide>) => void;
  onFinish: () => void;
};

export function RecordingStep({
  slides,
  aspectRatio,
  onUpdateSlide,
  onFinish,
}: RecordingStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const currentSlide = slides[currentIndex];
  const recordedCount = slides.filter((s) => s.audioBlob).length;

  useEffect(() => {
    return () => {
      audioPlayerRef.current?.pause();
    };
  }, [currentIndex]);

  if (!currentSlide) {
    return null;
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });
        onUpdateSlide(currentSlide.id, { audioBlob });
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      appLogger.error('💥 Microfone não disponível.', { error });
      window.alert('Precisamos de acesso ao microfone para gravar o áudio.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playRecording = () => {
    if (!currentSlide.audioBlob) {
      return;
    }

    const url = URL.createObjectURL(currentSlide.audioBlob);
    const audio = new Audio(url);
    audioPlayerRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    setIsPlaying(true);
    audio.play().catch((error) => {
      appLogger.error('💥 Não foi possível reproduzir o áudio.', { error });
      setIsPlaying(false);
    });
  };

  const stopPlaying = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const deleteRecording = () => {
    onUpdateSlide(currentSlide.id, { audioBlob: undefined });
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onFinish();
    }
  };

  const resolveSlideVisual = (slide: Slide) => {
    const asset = slide.customAsset;
    const visualSource = slide.visualSource ?? 'image-generation';

    if (visualSource === 'manual-upload') {
      if (asset?.previewUrl) {
        return {
          type: asset.type === 'video' ? ('video' as const) : ('image' as const),
          url: asset.previewUrl,
        };
      }
      return null;
    }

    if (visualSource === 'math-video') {
      if (asset?.type === 'video' && asset.previewUrl) {
        return { type: 'video' as const, url: asset.previewUrl };
      }
      return null;
    }

    if (asset?.type === 'image' && asset.previewUrl) {
      return { type: 'image' as const, url: asset.previewUrl };
    }
    if (slide.imageUrl) {
      return { type: 'image' as const, url: slide.imageUrl };
    }
    return null;
  };

  const progress = Math.round(((currentIndex + 1) / slides.length) * 100);

  const arClass =
    aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-[55vh]'
      : aspectRatio === '16:9'
        ? 'aspect-[16/9] max-w-[60vw]'
        : 'aspect-square max-h-[55vh]';

  return (
    <div className="flex min-h-screen flex-col pt-12 sm:pt-14">
      {/* Header with progress */}
      <div className="glass-card mx-2 mb-3 rounded-lg px-3 py-2 sm:mx-4 sm:mb-4 sm:rounded-xl sm:px-4 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-500/20 sm:h-10 sm:w-10">
              <Mic size={16} className="text-danger-400 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white sm:text-base">Estúdio de Narração</p>
              <p className="text-xs text-white/50 sm:text-sm">
                {recordedCount}/{slides.length} gravados
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs text-white/50 sm:text-sm">
            {currentIndex + 1}/{slides.length}
          </span>
        </div>
        <div className="mt-2 progress-bar sm:mt-3">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2 pb-3 sm:gap-4 sm:px-4 sm:pb-4 md:gap-6 lg:flex-row lg:items-start lg:justify-center">
        {/* Slide preview */}
        <div
          className={`relative flex-shrink-0 overflow-hidden rounded-xl border border-dark-700 bg-dark-900 shadow-2xl sm:rounded-2xl ${arClass}`}
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
                alt="Visual do slide"
                className="h-full w-full object-cover"
              />
            );
          })()}

          {/* Recording indicator */}
          {currentSlide.audioBlob && (
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-success-500 px-2.5 py-1 text-xs font-medium text-white shadow-lg">
              <Check size={14} />
              Gravado
            </div>
          )}

          {/* Recording pulse */}
          {isRecording && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-950/40">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-danger-500/50" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-danger-500 shadow-lg">
                  <MicOff size={32} className="text-white" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Script and controls */}
        <div className="flex w-full max-w-lg flex-col gap-3 sm:gap-4 lg:max-h-[70vh]">
          {/* Script card */}
          <div className="glass-card flex-1 space-y-3 overflow-hidden p-3 sm:space-y-4 sm:p-4">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 sm:mb-2 sm:gap-2">
                <Volume2 size={14} className="text-primary-400 sm:h-4 sm:w-4" />
                <span className="text-xs font-medium text-white/70 sm:text-sm">
                  Briefing do slide
                </span>
              </div>
              <div className="max-h-[15vh] overflow-y-auto rounded-lg bg-dark-900/60 p-2.5 sm:max-h-[20vh] sm:p-3 lg:max-h-[28vh]">
                <p className="text-sm leading-relaxed text-white/80 sm:text-base">
                  {currentSlide.scriptText}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 p-2.5 sm:rounded-xl sm:p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-200 sm:text-[11px]">
                Texto literal para narrar
              </p>
              <div className="mt-1.5 max-h-[15vh] overflow-y-auto text-base font-semibold leading-relaxed text-white sm:mt-2 sm:max-h-[18vh] sm:text-lg">
                {currentSlide.narrationText ||
                  'Texto de narração não disponível.'}
              </div>
            </div>
          </div>

          {/* Recording controls */}
          <div className="glass-card p-3 sm:p-4 md:p-5">
            <div className="flex items-center justify-center gap-3 sm:gap-4">
              {!currentSlide.audioBlob ? (
                !isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="group relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-danger-500 to-danger-600 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-danger-500/30 sm:h-20 sm:w-20"
                  >
                    <div className="absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
                    <Mic size={24} className="sm:h-8 sm:w-8" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-danger-600 shadow-lg transition-all duration-300 hover:scale-105 sm:h-20 sm:w-20"
                  >
                    <div className="h-6 w-6 rounded-md bg-danger-600 sm:h-8 sm:w-8" />
                  </button>
                )
              ) : (
                <div className="flex items-center gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={isPlaying ? stopPlaying : playRecording}
                    className="btn-icon h-12 w-12 bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 sm:h-14 sm:w-14"
                  >
                    {isPlaying ? <Pause size={18} className="sm:h-[22px] sm:w-[22px]" /> : <Play size={18} className="sm:h-[22px] sm:w-[22px]" />}
                  </button>
                  <button
                    type="button"
                    onClick={deleteRecording}
                    className="btn-icon h-12 w-12 hover:border-danger-500/50 hover:bg-danger-500/10 hover:text-danger-400 sm:h-14 sm:w-14"
                  >
                    <Trash2 size={16} className="sm:h-5 sm:w-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Hint text */}
            <p className="mt-3 text-center text-xs text-white/40 sm:mt-4 sm:text-sm">
              {isRecording
                ? 'Clique para parar'
                : currentSlide.audioBlob
                  ? 'Ouça ou regrave'
                  : 'Clique para gravar'}
            </p>

            {/* Next button */}
            <button
              type="button"
              onClick={handleNext}
              disabled={!currentSlide.audioBlob}
              className="btn-primary mt-3 w-full sm:mt-4"
            >
              {currentIndex === slides.length - 1
                ? 'Finalizar'
                : 'Próximo'}
              <ArrowRight size={16} className="sm:h-[18px] sm:w-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Slide thumbnails */}
      <div className="glass-card mx-2 mb-3 rounded-lg p-2 sm:mx-4 sm:mb-4 sm:rounded-xl sm:p-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:gap-2">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setCurrentIndex(index)}
              className={`relative flex-shrink-0 overflow-hidden rounded transition-all duration-200 sm:rounded-lg ${
                index === currentIndex
                  ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-dark-900 sm:ring-offset-2'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <div className="h-10 w-14 bg-dark-800 sm:h-12 sm:w-16">
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
              {slide.audioBlob && (
                <div className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-success-500">
                  <Check size={10} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
