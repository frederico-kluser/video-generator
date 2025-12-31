import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Mic,
  Play,
  Square,
  Trash2,
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
      appLogger.error('Microfone não disponível.', { error });
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
      appLogger.error('Não foi possível reproduzir o áudio.', { error });
      setIsPlaying(false);
    });
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

  const progress = Math.round((currentIndex / slides.length) * 100);

  const arClass =
    aspectRatio === '9:16'
      ? 'aspect-[9/16] h-[60vh]'
      : aspectRatio === '16:9'
        ? 'aspect-[16/9] w-[80vw]'
        : 'aspect-square h-[60vh]';

  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 p-4">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <p className="font-semibold text-gray-300">Estúdio de narração</p>
          <p className="text-sm text-gray-500">
            Slide {currentIndex + 1} / {slides.length}
          </p>
        </div>
        <div className="mx-auto mt-3 h-1 w-full max-w-4xl rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6 md:flex-row">
        <div
          className={`${arClass} flex-shrink-0 overflow-hidden rounded-2xl border border-gray-800 bg-black shadow-2xl`}
        >
          {currentSlide.imageUrl ? (
            <img
              src={currentSlide.imageUrl}
              alt="Visual do slide"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-500">
              Sem imagem
            </div>
          )}
          {currentSlide.audioBlob && (
            <div className="absolute right-4 top-4 rounded-full bg-emerald-500 p-2 text-white">
              <CheckCircle2 size={20} />
            </div>
          )}
        </div>

        <div className="flex h-[60vh] w-full max-w-lg flex-col">
          <div className="flex-1 overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-6 text-lg text-gray-100">
            {currentSlide.scriptText}
          </div>

          <div className="mt-4 space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center justify-center gap-6">
              {!currentSlide.audioBlob ? (
                !isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-500"
                  >
                    <Mic size={28} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-red-700"
                  >
                    <Square size={32} />
                  </button>
                )
              ) : (
                <>
                  <button
                    type="button"
                    onClick={playRecording}
                    disabled={isPlaying}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-700 text-white transition hover:bg-gray-800"
                  >
                    <Play size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={deleteRecording}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-700 text-gray-400 transition hover:border-red-800 hover:text-red-400"
                  >
                    <Trash2 size={18} />
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleNext}
              disabled={!currentSlide.audioBlob}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500"
            >
              {currentIndex === slides.length - 1
                ? 'Finalizar projeto'
                : 'Próximo slide'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
