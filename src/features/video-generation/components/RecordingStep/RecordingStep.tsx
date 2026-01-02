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

  const progress = Math.round(((currentIndex + 1) / slides.length) * 100);

  const arClass =
    aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-[55vh]'
      : aspectRatio === '16:9'
        ? 'aspect-[16/9] max-w-[60vw]'
        : 'aspect-square max-h-[55vh]';

  return (
    <div className="flex min-h-screen flex-col pt-14">
      {/* Header with progress */}
      <div className="glass-card mx-4 mb-4 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-500/20">
              <Mic size={20} className="text-danger-400" />
            </div>
            <div>
              <p className="font-semibold text-white">Estúdio de Narração</p>
              <p className="text-sm text-white/50">
                {recordedCount} de {slides.length} slides gravados
              </p>
            </div>
          </div>
          <span className="text-sm text-white/50">
            Slide {currentIndex + 1} / {slides.length}
          </span>
        </div>
        <div className="mt-3 progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-4 lg:flex-row lg:items-start lg:justify-center">
        {/* Slide preview */}
        <div
          className={`relative flex-shrink-0 overflow-hidden rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl ${arClass}`}
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
        <div className="flex w-full max-w-lg flex-col gap-4 lg:max-h-[70vh]">
          {/* Script card */}
          <div className="glass-card flex-1 space-y-4 overflow-hidden p-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Volume2 size={16} className="text-primary-400" />
                <span className="text-sm font-medium text-white/70">
                  Briefing do slide
                </span>
              </div>
              <div className="max-h-[20vh] overflow-y-auto rounded-lg bg-dark-900/60 p-3 lg:max-h-[28vh]">
                <p className="text-base leading-relaxed text-white/80">
                  {currentSlide.scriptText}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-200">
                Texto literal para narrar
              </p>
              <div className="mt-2 max-h-[18vh] overflow-y-auto text-lg font-semibold leading-relaxed text-white">
                {currentSlide.narrationText ||
                  'Texto de narração não disponível. Ajuste no editor.'}
              </div>
            </div>
          </div>

          {/* Recording controls */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-center gap-4">
              {!currentSlide.audioBlob ? (
                !isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-danger-500 to-danger-600 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-danger-500/30"
                  >
                    <div className="absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
                    <Mic size={32} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-danger-600 shadow-lg transition-all duration-300 hover:scale-105"
                  >
                    <div className="h-8 w-8 rounded-md bg-danger-600" />
                  </button>
                )
              ) : (
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={isPlaying ? stopPlaying : playRecording}
                    className="btn-icon h-14 w-14 bg-primary-500/20 text-primary-400 hover:bg-primary-500/30"
                  >
                    {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                  </button>
                  <button
                    type="button"
                    onClick={deleteRecording}
                    className="btn-icon h-14 w-14 hover:border-danger-500/50 hover:bg-danger-500/10 hover:text-danger-400"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              )}
            </div>

            {/* Hint text */}
            <p className="mt-4 text-center text-sm text-white/40">
              {isRecording
                ? 'Clique para parar a gravação'
                : currentSlide.audioBlob
                  ? 'Ouça ou regrave o áudio'
                  : 'Clique para iniciar a gravação'}
            </p>

            {/* Next button */}
            <button
              type="button"
              onClick={handleNext}
              disabled={!currentSlide.audioBlob}
              className="btn-primary mt-4 w-full"
            >
              {currentIndex === slides.length - 1
                ? 'Finalizar projeto'
                : 'Próximo slide'}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Slide thumbnails */}
      <div className="glass-card mx-4 mb-4 rounded-xl p-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setCurrentIndex(index)}
              className={`relative flex-shrink-0 overflow-hidden rounded-lg transition-all duration-200 ${
                index === currentIndex
                  ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-dark-900'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <div className="h-12 w-16 bg-dark-800">
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
