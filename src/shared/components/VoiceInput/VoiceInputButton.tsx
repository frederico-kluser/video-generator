import { Loader2, Mic, StopCircle } from 'lucide-react';
import { useState } from 'react';

import { transcribeAudioBlob } from '@/services/openaiService';
import { useVoiceRecorder } from '@/shared/hooks/useVoiceRecorder';
import { appLogger } from '@/shared/logging/logger';

export type VoiceInputButtonProps = {
  onTranscription: (text: string) => void;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  disabled?: boolean;
};

export function VoiceInputButton({
  onTranscription,
  className = '',
  size = 'md',
  ariaLabel = 'Gravar áudio e transcrever',
  disabled,
}: VoiceInputButtonProps) {
  const { isRecording, startRecording, stopRecording, error: recorderError } =
    useVoiceRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (disabled || isTranscribing) {
      return;
    }

    setError(null);

    if (!isRecording) {
      await startRecording();
      if (recorderError) {
        setError(recorderError);
      }
      return;
    }

    let blob: Blob | null = null;
    try {
      blob = await stopRecording();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível finalizar a gravação.';
      setError(message);
      appLogger.error('Erro ao finalizar gravação de voz', { error: err });
      return;
    }

    if (!blob) {
      return;
    }

    try {
      setIsTranscribing(true);
      const transcript = await transcribeAudioBlob(blob);
      if (transcript) {
        onTranscription(transcript);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível transcrever o áudio.';
      setError(message);
      appLogger.error('Falha ao transcrever áudio', { error: err });
    } finally {
      setIsTranscribing(false);
    }
  };

  const buttonSizeClasses =
    size === 'sm'
      ? 'h-9 w-9 text-sm'
      : 'h-10 w-10 text-base';

  const isBusy = isRecording || isTranscribing;

  return (
    <div className={className}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={isRecording}
        onClick={handleClick}
        disabled={disabled}
        className={`btn-icon relative ${buttonSizeClasses} ${
          isRecording
            ? 'border-danger-500/60 bg-danger-500/10 text-danger-200 animate-pulse'
            : 'border-white/10 bg-dark-800/80 text-white/60 hover:text-white'
        } ${isTranscribing ? 'cursor-wait opacity-75' : ''}`}
      >
        {isTranscribing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <StopCircle className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        <span className="sr-only">
          {isRecording
            ? 'Parar gravação e transcrever'
            : 'Iniciar gravação para transcrever'}
        </span>
      </button>
      {isBusy && (
        <p className="mt-1 text-[11px] text-white/50" role="status">
          {isRecording ? 'Gravando...' : 'Transcrevendo...'}
        </p>
      )}
      {(error || recorderError) && !isBusy && (
        <p className="mt-1 text-xs text-danger-300" role="alert">
          {error ?? recorderError}
        </p>
      )}
    </div>
  );
}
