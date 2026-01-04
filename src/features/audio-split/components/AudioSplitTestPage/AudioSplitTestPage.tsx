import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/shared/components/ui/Button';
import { LabCard } from '@/shared/components/ui/LabCard';
import { RecordButton } from '@/shared/components/ui/RecordButton';
import { validateAudioBufferHasSignal } from '@/shared/services/audioConversion.service';
import { audioBufferToWAVBlob } from '@/shared/utils/webav.utils';

type SplitSegment = {
  id: string;
  label: string;
  url: string;
  start: number;
  end: number;
  duration: number;
};

const formatSeconds = (value: number) => `${value.toFixed(2)}s`;

const sliceAudioBuffer = (
  buffer: AudioBuffer,
  startTime: number,
  endTime: number,
): AudioBuffer => {
  const clampedStart = Math.max(0, Math.min(startTime, buffer.duration));
  const clampedEnd = Math.max(clampedStart, Math.min(endTime, buffer.duration));
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(clampedStart * sampleRate);
  const endSample = Math.floor(clampedEnd * sampleRate);
  const frameCount = Math.max(endSample - startSample, 1);

  const sliced = new AudioBuffer({
    length: frameCount,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate,
  });

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const channelData = buffer.getChannelData(channel);
    const slice = new Float32Array(frameCount);
    slice.set(channelData.subarray(startSample, endSample));
    sliced.copyToChannel(slice, channel);
  }

  return sliced;
};

const cloneAudioBuffer = (source: AudioBuffer): AudioBuffer => {
  const clone = new AudioBuffer({
    length: source.length,
    numberOfChannels: source.numberOfChannels,
    sampleRate: source.sampleRate,
  });

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const channelData = source.getChannelData(channel);
    clone.copyToChannel(channelData, channel);
  }

  return clone;
};

const MEDIA_RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/wav',
] as const;

const resolveSupportedMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return MEDIA_RECORDER_MIME_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
};

export function AudioSplitTestPage() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewUrlRef = useRef<string | null>(null);
  const segmentsRef = useRef<SplitSegment[]>([]);
  const decodeContextRef = useRef<AudioContext | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isPreparingRecorder, setIsPreparingRecorder] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [splitPoint, setSplitPoint] = useState(0);
  const [segments, setSegments] = useState<SplitSegment[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessingSplit, setIsProcessingSplit] = useState(false);

  const canRecord = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return Boolean(window.navigator?.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    previewUrlRef.current = audioPreviewUrl;
  }, [audioPreviewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    return () => {
      segmentsRef.current.forEach((segment) => URL.revokeObjectURL(segment.url));
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (decodeContextRef.current) {
        decodeContextRef.current.close().catch(() => undefined);
        decodeContextRef.current = null;
      }
    };
  }, []);

  const resetPreviewState = () => {
    setAudioBuffer(null);
    setAudioDuration(0);
    setSplitPoint(0);
    setSegments([]);
  };

  const handleStartRecording = async () => {
    if (!canRecord || isRecording || isPreparingRecorder) {
      return;
    }

    setErrorMessage(null);
    resetPreviewState();

    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
      setAudioPreviewUrl(null);
    }

    setIsPreparingRecorder(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;

      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          chunksRef.current = [];

          const url = URL.createObjectURL(blob);
          setAudioPreviewUrl((prev) => {
            if (prev) {
              URL.revokeObjectURL(prev);
            }
            return url;
          });

          const arrayBuffer = await blob.arrayBuffer();
          if (!decodeContextRef.current) {
            decodeContextRef.current = new AudioContext();
          }
          const audioContext = decodeContextRef.current;
          const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
          const processedBuffer = cloneAudioBuffer(decoded);

          if (!validateAudioBufferHasSignal(processedBuffer)) {
            setErrorMessage('O áudio capturado ficou em silêncio. Tente gravar novamente.');
            return;
          }

          setAudioBuffer(processedBuffer);
          setAudioDuration(processedBuffer.duration);
          setSplitPoint(Number((processedBuffer.duration / 2).toFixed(2)));
        } catch (error) {
          console.error(error);
          setErrorMessage('Não conseguimos processar o áudio gravado.');
        }
      };

      recorderRef.current = recorder;
      streamRef.current = stream;

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error(error);
      setErrorMessage('Não foi possível iniciar a gravação. Verifique as permissões do microfone.');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = null;
    } finally {
      setIsPreparingRecorder(false);
    }
  };

  const handleStopRecording = () => {
    if (!recorderRef.current) {
      return;
    }

    try {
      recorderRef.current.stop();
    } catch (error) {
      console.error('Erro ao parar gravação', error);
    }

    setIsRecording(false);
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleSplit = async () => {
    if (!audioBuffer) {
      return;
    }

    if (splitPoint <= 0 || splitPoint >= audioDuration) {
      setErrorMessage('Escolha um ponto dentro da duração do áudio gravado.');
      return;
    }

    setErrorMessage(null);
    setIsProcessingSplit(true);

    try {
      const firstSegmentBuffer = sliceAudioBuffer(audioBuffer, 0, splitPoint);
      const secondSegmentBuffer = sliceAudioBuffer(
        audioBuffer,
        splitPoint,
        audioBuffer.duration,
      );

      const [firstBlob, secondBlob] = await Promise.all([
        audioBufferToWAVBlob(firstSegmentBuffer),
        audioBufferToWAVBlob(secondSegmentBuffer),
      ]);

      const firstSegment: SplitSegment = {
        id: 'segment-a',
        label: 'Primeira parte',
        url: URL.createObjectURL(firstBlob),
        start: 0,
        end: splitPoint,
        duration: splitPoint,
      };

      const secondSegment: SplitSegment = {
        id: 'segment-b',
        label: 'Segunda parte',
        url: URL.createObjectURL(secondBlob),
        start: splitPoint,
        end: audioBuffer.duration,
        duration: audioBuffer.duration - splitPoint,
      };

      setSegments((previous) => {
        previous.forEach((segment) => URL.revokeObjectURL(segment.url));
        return [firstSegment, secondSegment];
      });
    } catch (error) {
      console.error(error);
      setErrorMessage('Falha ao gerar os splits. Tente novamente.');
    } finally {
      setIsProcessingSplit(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] text-primary-300">Labs</p>
        <h1 className="text-3xl font-semibold text-white">Audio Split Playground</h1>
        <p className="text-base text-white/70">
          Grave um áudio rápido, escolha um ponto de corte e visualize instantaneamente as duas
          partes resultantes para validar o fluxo descrito em docs/audio/split.md.
        </p>
      </header>

      {!canRecord && (
        <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4 text-orange-100">
          Seu navegador não suporta gravação de áudio via MediaRecorder. Abra esta página em um
          browser moderno (Chrome, Edge ou Safari 16.6+).
        </div>
      )}

      <LabCard
        title="1. Gravação"
        description="Capture um trecho curto para habilitar o slider."
        contentClassName="space-y-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <RecordButton
            type="button"
            onClick={handleStartRecording}
            disabled={!canRecord || isRecording || isPreparingRecorder}
            loading={isPreparingRecorder && !isRecording}
          >
            {isRecording ? 'Gravando…' : 'Iniciar gravação'}
          </RecordButton>
          <Button
            type="button"
            variant="secondary"
            onClick={handleStopRecording}
            disabled={!isRecording}
          >
            Parar
          </Button>
          {isPreparingRecorder && (
            <span className="text-sm text-white/70">Solicitando acesso ao microfone…</span>
          )}
        </div>

        {audioPreviewUrl && (
          <div className="space-y-2">
            <p className="text-sm text-white/70">
              Áudio gravado ({formatSeconds(audioDuration)})
            </p>
            <audio controls className="w-full" src={audioPreviewUrl} />
          </div>
        )}
      </LabCard>

      <LabCard
        title="2. Defina o corte"
        description="O slider só habilita depois que o áudio for processado. Os limites seguem o tempo total da gravação."
        contentClassName="space-y-4"
      >
        <div className="space-y-4">
          <input
            type="range"
            min={0}
            max={audioDuration}
            step={0.01}
            value={splitPoint}
            disabled={!audioBuffer}
            onChange={(event) => setSplitPoint(Number(event.target.value))}
            className="w-full"
          />
          <div className="flex flex-wrap gap-4 text-sm text-white/80">
            <span>
              Corte em <strong>{formatSeconds(splitPoint)}</strong>
            </span>
            <span>
              Duração total <strong>{formatSeconds(audioDuration)}</strong>
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="accent"
          onClick={handleSplit}
          disabled={!audioBuffer || splitPoint <= 0 || splitPoint >= audioDuration}
          loading={isProcessingSplit}
          className="mt-2"
        >
          Split agora
        </Button>
      </LabCard>

      {segments.length > 0 && (
        <LabCard
          title="3. Prévia dos áudios"
          description="Ouça cada parte após o corte."
          contentClassName="grid gap-4 md:grid-cols-2"
        >
          {segments.map((segment) => (
            <div key={segment.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="text-sm font-semibold text-white">
                {segment.label} · {formatSeconds(segment.duration)}
              </p>
              <p className="text-xs text-white/60">
                {formatSeconds(segment.start)} — {formatSeconds(segment.end)}
              </p>
              <audio controls className="mt-3 w-full" src={segment.url} />
            </div>
          ))}
        </LabCard>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
