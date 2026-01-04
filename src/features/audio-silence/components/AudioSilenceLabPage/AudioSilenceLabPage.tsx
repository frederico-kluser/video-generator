import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MicVAD } from '@ricky0123/vad-web';

import { Button } from '@/shared/components/ui/Button';
import { LabCard } from '@/shared/components/ui/LabCard';
import { Spinner } from '@/shared/components/ui/Spinner';

const MIN_SILENCE_MS = 700;

type SilenceWindow = {
  startMs: number;
  endMs: number;
};

type SpeechSegment = {
  start: number;
  end: number;
};

const formatTimestamp = (ms: number) => {
  const totalSeconds = Math.max(ms, 0) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
};

const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const buildSilenceParagraph = (windows: SilenceWindow[]) => {
  if (!windows.length) {
    return 'Não encontramos pausas de fala relevantes. Tente deixar pelo menos 1 segundo em silêncio real (sem falar) antes de clicar no botão.';
  }

  const fragments = windows.map((window, index) => {
    const duration = window.endMs - window.startMs;
    return `${index + 1}) ${formatTimestamp(window.startMs)}–${formatTimestamp(window.endMs)} (${formatDuration(duration)})`;
  });

  const joined =
    fragments.length === 1
      ? fragments[0]
      : `${fragments.slice(0, -1).join('; ')}; ${fragments[fragments.length - 1]}`;

  return `Identificamos ${fragments.length} ${fragments.length === 1 ? 'momento' : 'momentos'} de silêncio de fala (ausência de locução humana): ${joined}.`;
};

const deriveSilenceWindows = (
  speechSegments: SpeechSegment[],
  totalDurationMs: number,
  minSilenceMs: number,
): SilenceWindow[] => {
  if (!speechSegments.length) {
    return totalDurationMs >= minSilenceMs
      ? [{ startMs: 0, endMs: totalDurationMs }]
      : [];
  }

  const sorted = [...speechSegments].sort((a, b) => a.start - b.start);
  const windows: SilenceWindow[] = [];

  if (sorted[0].start >= minSilenceMs) {
    windows.push({ startMs: 0, endMs: sorted[0].start });
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const gap = next.start - current.end;
    if (gap >= minSilenceMs) {
      windows.push({ startMs: current.end, endMs: next.start });
    }
  }

  const lastSegment = sorted[sorted.length - 1];
  const tailGap = totalDurationMs - lastSegment.end;
  if (tailGap >= minSilenceMs) {
    windows.push({ startMs: lastSegment.end, endMs: totalDurationMs });
  }

  return windows;
};

export function AudioSilenceLabPage() {
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'stopped'>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [analysisParagraph, setAnalysisParagraph] = useState('');
  const [silenceWindows, setSilenceWindows] = useState<SilenceWindow[]>([]);
  const [vadStatus, setVadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [silenceConfidence, setSilenceConfidence] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<MicVAD | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const recordingEndRef = useRef<number | null>(null);
  const speechSegmentsRef = useRef<SpeechSegment[]>([]);
  const currentSpeechStartRef = useRef<number | null>(null);

  const supportsMedia =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  const resetAnalysis = () => {
    setAnalysisParagraph('');
    setSilenceWindows([]);
  };

  const getOrCreateStream = useCallback(async () => {
    if (streamRef.current) {
      return streamRef.current;
    }

    if (!supportsMedia) {
      throw new Error('Seu navegador não permite capturar áudio do microfone.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    streamRef.current = stream;
    return stream;
  }, [supportsMedia]);

  const handleSpeechStart = useCallback(() => {
    if (!recordingStartRef.current) {
      return;
    }
    currentSpeechStartRef.current = performance.now() - recordingStartRef.current;
  }, []);

  const handleSpeechEnd = useCallback(() => {
    if (!recordingStartRef.current || currentSpeechStartRef.current == null) {
      return;
    }
    const relativeEnd = performance.now() - recordingStartRef.current;
    speechSegmentsRef.current.push({
      start: currentSpeechStartRef.current,
      end: relativeEnd,
    });
    currentSpeechStartRef.current = null;
  }, []);

  const ensureVad = useCallback(async () => {
    if (vadRef.current) {
      return vadRef.current;
    }

    setVadStatus('loading');

    try {
      const { MicVAD } = await import('@ricky0123/vad-web');
      const vad = await MicVAD.new({
        model: 'v5',
        positiveSpeechThreshold: 0.35,
        negativeSpeechThreshold: 0.2,
        redemptionMs: 600,
        preSpeechPadMs: 500,
        minSpeechMs: 250,
        getStream: async () => getOrCreateStream(),
        onSpeechStart: handleSpeechStart,
        onSpeechEnd: () => handleSpeechEnd(),
        onFrameProcessed: (frame) => {
          if (typeof frame?.notSpeech === 'number') {
            setSilenceConfidence(frame.notSpeech);
          }
        },
      });

      vadRef.current = vad;
      setVadStatus('ready');
      return vad;
    } catch (error) {
      console.error('Falha ao inicializar o Silero VAD', error);
      setVadStatus('error');
      throw error;
    }
  }, [getOrCreateStream, handleSpeechEnd, handleSpeechStart]);

  const startRecording = useCallback(async () => {
    if (!supportsMedia) {
      setErrorMessage('Seu navegador/navegação bloqueou o acesso ao microfone.');
      return;
    }

    setErrorMessage(null);
    resetAnalysis();

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    recordedChunksRef.current = [];
    speechSegmentsRef.current = [];
    currentSpeechStartRef.current = null;

    try {
      const stream = await getOrCreateStream();
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      recordingStartRef.current = performance.now();
      recordingEndRef.current = null;
      setRecordingState('recording');

      const vad = await ensureVad();
      await vad.start();
    } catch (error) {
      console.error('Erro ao iniciar a gravação', error);
      setRecordingState('idle');
      setErrorMessage('Não conseguimos iniciar a gravação. Verifique permissões e tente novamente.');
    }
  }, [audioUrl, ensureVad, getOrCreateStream, supportsMedia]);

  const finalizeSpeechSegmentIfNeeded = useCallback(() => {
    if (!recordingStartRef.current || currentSpeechStartRef.current == null) {
      return;
    }

    const relativeEnd =
      (recordingEndRef.current ?? performance.now()) - recordingStartRef.current;

    speechSegmentsRef.current.push({
      start: currentSpeechStartRef.current,
      end: relativeEnd,
    });
    currentSpeechStartRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (recordingState !== 'recording') {
      return;
    }

    recordingEndRef.current = performance.now();
    finalizeSpeechSegmentIfNeeded();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    if (vadRef.current) {
      void vadRef.current.pause();
      setSilenceConfidence(0);
    }

    setRecordingState('stopped');
  }, [finalizeSpeechSegmentIfNeeded, recordingState]);

  const handleRecordButton = () => {
    if (recordingState === 'recording') {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const analyzeSilence = () => {
    if (!recordingStartRef.current || !recordingEndRef.current) {
      setAnalysisParagraph('Grave e pare a captura antes de pedir o relatório de silêncio de fala.');
      setSilenceWindows([]);
      return;
    }

    const totalDuration = recordingEndRef.current - recordingStartRef.current;
    const windows = deriveSilenceWindows(
      speechSegmentsRef.current,
      totalDuration,
      MIN_SILENCE_MS,
    );

    setSilenceWindows(windows);
    setAnalysisParagraph(buildSilenceParagraph(windows));
  };

  const silenceConfidencePercent = useMemo(
    () => Math.round(silenceConfidence * 100),
    [silenceConfidence],
  );

  const canAnalyze =
    recordingState === 'stopped' && !!recordingStartRef.current && !!recordingEndRef.current;

  const detectorStatusLabel =
    vadStatus === 'loading'
      ? 'Carregando modelo Silero...'
      : vadStatus === 'ready'
        ? 'Pronto para gravar'
        : vadStatus === 'idle'
          ? 'Iniciaremos o modelo ao gravar'
          : 'Falha ao carregar o Silero VAD';

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      void vadRef.current?.pause();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioUrl]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12 text-white">
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-accent-300">Audio Labs</p>
        <h1 className="text-3xl font-semibold">Laboratório de silêncio de fala</h1>
        <p className="text-base text-white/70">
          Esta página usa o Silero VAD (via @ricky0123/vad-web) descrito na documentação para
          diferenciar silêncio de fala de silêncio acústico. Grave um trecho, clique em
          &ldquo;Encontrar momentos de silêncio&rdquo; e veja onde realmente não havia locução humana.
        </p>
      </header>

      <LabCard
        title="Status do detector"
        description={
          vadStatus === 'loading' ? (
            <Spinner label={detectorStatusLabel} className="text-white" />
          ) : (
            <span className="text-lg font-medium text-white">{detectorStatusLabel}</span>
          )
        }
        actions={
          <Button
            type="button"
            variant={recordingState === 'recording' ? 'danger' : 'primary'}
            onClick={handleRecordButton}
            disabled={!supportsMedia || vadStatus === 'error'}
          >
            {recordingState === 'recording' ? 'Parar gravação' : 'Gravar áudio'}
          </Button>
        }
        contentClassName="space-y-6"
      >
        <p className="text-sm text-white/60">
          {recordingState === 'recording'
            ? 'Estamos capturando áudio em 48 kHz, com supressão de ruído ligada e análise de fala em tempo real.'
            : 'Clique em gravar, fale algo, deixe pausas naturais e depois encerre para rodar a análise.'}
        </p>
        <div>
          <p className="text-sm font-medium text-white/80">
            Confiança instantânea de silêncio de fala: {silenceConfidencePercent}%
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent-400 transition-[width] duration-200"
              style={{ width: `${silenceConfidencePercent}%` }}
            />
          </div>
        </div>
        {errorMessage && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </p>
        )}
      </LabCard>

      <LabCard
        title="Encontrar silêncio de fala"
        description="O algoritmo usa probabilidades contínuas (0-1) para marcar gaps reais entre blocos de fala."
        actions={
          <Button
            type="button"
            variant="accent"
            onClick={analyzeSilence}
            disabled={!canAnalyze}
          >
            Encontrar momentos de silêncio
          </Button>
        }
        contentClassName="space-y-4"
      >
        <p className="text-base text-white/80">
          {analysisParagraph || 'Nenhuma análise executada ainda.'}
        </p>

        {silenceWindows.length > 0 && (
          <ul className="space-y-3">
            {silenceWindows.map((window, index) => {
              const duration = window.endMs - window.startMs;
              return (
                <li
                  key={`${window.startMs}-${window.endMs}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
                >
                  <span className="text-white/80">
                    {index + 1}. {formatTimestamp(window.startMs)} → {formatTimestamp(window.endMs)}
                  </span>
                  <span className="font-medium text-accent-200">{formatDuration(duration)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </LabCard>

      {audioUrl && (
        <LabCard
          title="Pré-escuta da captura"
          description="Use este player para conferir se a gravação está ok antes de rodar novas análises."
        >
          <audio
            aria-label="Pré-escuta da gravação recente"
            controls
            className="w-full"
            src={audioUrl}
          >
            <track
              default
              kind="captions"
              label="Legenda placeholder"
              src="data:text/vtt;charset=utf-8,WEBVTT%0A%0A00:00.000 --> 00:00.001%0ATranscri%C3%A7%C3%A3o%20ser%C3%A1%20gerada%20posteriormente"
              srcLang="pt-BR"
            />
          </audio>
        </LabCard>
      )}
    </div>
  );
}
