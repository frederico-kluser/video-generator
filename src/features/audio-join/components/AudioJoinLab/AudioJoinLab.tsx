import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Crunker from 'crunker';

import { appLogger } from '@/shared/logging/logger';

type RecordingSlot = 'clipA' | 'clipB';

type RecordingStatus = 'idle' | 'recording' | 'recorded';

interface RecordingState {
  status: RecordingStatus;
  blob: Blob | null;
  url: string | null;
}

interface JoinedAudioPreview {
  url: string;
  blob: Blob;
  durationMs: number;
}

const slotMetadata: Record<RecordingSlot, { title: string; helper: string }> = {
  clipA: {
    title: 'Áudio A',
    helper: 'Grave o primeiro trecho (ex.: introdução).',
  },
  clipB: {
    title: 'Áudio B',
    helper: 'Grave o segundo trecho (ex.: conclusão).',
  },
};

const statusLabel: Record<RecordingStatus, string> = {
  idle: 'Pronto',
  recording: 'Gravando…',
  recorded: 'Gravado',
};

const mimeCandidates = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
];

const slotsOrder: RecordingSlot[] = ['clipA', 'clipB'];

export function AudioJoinLab() {
  const [recordings, setRecordings] = useState<Record<RecordingSlot, RecordingState>>({
    clipA: { status: 'idle', blob: null, url: null },
    clipB: { status: 'idle', blob: null, url: null },
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [joinedAudio, setJoinedAudio] = useState<JoinedAudioPreview | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const activeSlotRef = useRef<RecordingSlot | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const slotUrlRef = useRef<Record<RecordingSlot, string | null>>({
    clipA: null,
    clipB: null,
  });
  const joinedUrlRef = useRef<string | null>(null);

  const isMediaRecorderAvailable =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'MediaRecorder' in window &&
    !!navigator.mediaDevices?.getUserMedia;

  const preferredMimeType = useMemo(() => {
    if (!isMediaRecorderAvailable) {
      return undefined;
    }
    return mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  }, [isMediaRecorderAvailable]);

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const updateSlot = useCallback(
    (slot: RecordingSlot, updater: (prev: RecordingState) => RecordingState) => {
      setRecordings((prev) => {
        const nextSlotState = updater(prev[slot]);
        const previousUrl = slotUrlRef.current[slot];
        if (previousUrl && previousUrl !== nextSlotState.url) {
          URL.revokeObjectURL(previousUrl);
        }
        slotUrlRef.current[slot] = nextSlotState.url ?? null;
        return {
          ...prev,
          [slot]: nextSlotState,
        };
      });
    },
    [],
  );

  const updateJoinedAudio = useCallback((next: JoinedAudioPreview | null) => {
    setJoinedAudio((prev) => {
      if (prev?.url && prev.url !== next?.url) {
        URL.revokeObjectURL(prev.url);
      }
      joinedUrlRef.current = next?.url ?? null;
      return next;
    });
  }, []);

  const startRecording = useCallback(
    async (slot: RecordingSlot) => {
      if (!isMediaRecorderAvailable) {
        setErrorMessage('Seu navegador não suporta MediaRecorder. Use Chrome, Edge ou Safari 16.6+.');
        return;
      }

      if (mediaRecorderRef.current) {
        setErrorMessage('Já existe uma gravação em andamento. Pare antes de iniciar outra.');
        return;
      }

      setErrorMessage(null);
      updateJoinedAudio(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const recorder = new MediaRecorder(
          stream,
          preferredMimeType ? { mimeType: preferredMimeType } : undefined,
        );

        mediaRecorderRef.current = recorder;
        activeSlotRef.current = slot;
        chunksRef.current = [];

        updateSlot(slot, () => ({ status: 'recording', blob: null, url: null }));

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          setErrorMessage('Falha durante a captura do áudio. Tente novamente.');
          updateSlot(slot, () => ({ status: 'idle', blob: null, url: null }));
          releaseStream();
          mediaRecorderRef.current = null;
          activeSlotRef.current = null;
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: preferredMimeType ?? recorder.mimeType ?? 'audio/webm',
          });
          const url = URL.createObjectURL(blob);

          updateSlot(slot, () => ({ status: 'recorded', blob, url }));

          chunksRef.current = [];
          mediaRecorderRef.current = null;
          activeSlotRef.current = null;
          releaseStream();
        };

        recorder.start();
      } catch (err) {
        appLogger.error('Microphone permission denied inside AudioJoinLab', { error: err });
        setErrorMessage('Não foi possível acessar o microfone. Verifique as permissões.');
        updateSlot(slot, () => ({ status: 'idle', blob: null, url: null }));
        releaseStream();
        mediaRecorderRef.current = null;
        activeSlotRef.current = null;
      }
    },
    [isMediaRecorderAvailable, preferredMimeType, releaseStream, updateJoinedAudio, updateSlot],
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const resetSlot = useCallback(
    (slot: RecordingSlot) => {
      if (activeSlotRef.current === slot && mediaRecorderRef.current) {
        stopRecording();
        return;
      }

      updateSlot(slot, () => ({ status: 'idle', blob: null, url: null }));
      setErrorMessage(null);
      updateJoinedAudio(null);
    },
    [stopRecording, updateJoinedAudio, updateSlot],
  );

  const canJoin = slotsOrder.every((slot) => recordings[slot].status === 'recorded');

  const joinRecordings = useCallback(async () => {
    if (!canJoin) {
      return;
    }

    setIsJoining(true);
    setErrorMessage(null);
    updateJoinedAudio(null);

    const audioContext = new AudioContext();

    try {
      const buffers = await Promise.all(
        slotsOrder.map(async (slot) => {
          const blob = recordings[slot].blob;
          if (!blob) {
            throw new Error('Missing blob');
          }
          const arrayBuffer = await blob.arrayBuffer();
          return audioContext.decodeAudioData(arrayBuffer.slice(0));
        }),
      );

      const crunker = new Crunker({ sampleRate: 48000 });
      const concatenated = crunker.concatAudio(buffers);
      const { blob, url } = crunker.export(concatenated, 'audio/wav');

      updateJoinedAudio({
        blob,
        url,
        durationMs: Math.round(concatenated.duration * 1000),
      });
    } catch (err) {
      appLogger.error('Failed to concat audio buffers in AudioJoinLab', { error: err });
      setErrorMessage('Não deu para juntar os áudios. Tente novamente ou grave novamente os trechos.');
    } finally {
      await audioContext.close().catch(() => undefined);
      setIsJoining(false);
    }
  }, [canJoin, recordings, updateJoinedAudio]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      releaseStream();
      slotsOrder.forEach((slot) => {
        const url = slotUrlRef.current[slot];
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
      if (joinedUrlRef.current) {
        URL.revokeObjectURL(joinedUrlRef.current);
      }
    };
  }, [releaseStream]);

  const formatDuration = (durationMs: number) => {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-primary-900/30 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary-200">Audio Join Lab</p>
        <h1 className="mt-3 text-3xl font-bold text-white">Teste rápido de concatenação client-side</h1>
        <p className="mt-4 text-base text-white/70">
          Esta página aplica o pipeline recomendado em <code className="rounded bg-white/10 px-2 py-1 text-sm">docs/audio/join.md</code>:
          MediaRecorder &rarr; normalização opcional &rarr; <span className="font-semibold text-primary-200">Crunker</span> para juntar e exportar WAV.
          Grave dois trechos curtos, clique em Join e faça o preview imediatamente.
        </p>
        {!isMediaRecorderAvailable && (
          <p className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Seu navegador não expõe MediaRecorder. Use Chrome, Edge ou Safari 16.6+ para liberar a captura de áudio.
          </p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {slotsOrder.map((slot) => {
          const slotState = recordings[slot];
          const isRecording = slotState.status === 'recording';
          const isRecorded = slotState.status === 'recorded';

          return (
            <section
              key={slot}
              className="flex h-full flex-col rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6"
            >
              <header className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/60">Slot {slot === 'clipA' ? 'A' : 'B'}</p>
                  <h2 className="text-2xl font-semibold text-white">{slotMetadata[slot].title}</h2>
                </div>
                <span
                  className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                >
                  {statusLabel[slotState.status]}
                </span>
              </header>

              <p className="mt-3 text-sm text-white/70">{slotMetadata[slot].helper}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => (isRecording ? stopRecording() : startRecording(slot))}
                  className={`flex flex-1 items-center justify-center rounded-2xl px-4 py-3 text-base font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                    isRecording
                      ? 'bg-rose-600/80 hover:bg-rose-500/90'
                      : 'bg-primary-600/80 hover:bg-primary-500/90'
                  }`}
                >
                  {isRecording ? 'Parar gravação' : 'Gravar'}
                </button>

                {isRecorded && (
                  <button
                    type="button"
                    onClick={() => resetSlot(slot)}
                    className="rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold text-white/80 hover:border-white/40 hover:text-white"
                  >
                    Regravar
                  </button>
                )}
              </div>

              {slotState.url && (
                <div className="mt-6 space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Preview</p>
                  <audio controls src={slotState.url} className="w-full" preload="metadata" />
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/60">Join</p>
            <h3 className="text-2xl font-semibold text-white">Una os dois trechos em um único WAV</h3>
          </div>
          <button
            type="button"
            onClick={joinRecordings}
            disabled={!canJoin || isJoining}
            className={`rounded-2xl px-6 py-3 text-base font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              !canJoin || isJoining
                ? 'cursor-not-allowed bg-white/10 text-white/40'
                : 'bg-accent-500/90 hover:bg-accent-400'
            }`}
          >
            {isJoining ? 'Juntando…' : 'Join'}
          </button>
        </div>

        <p className="mt-4 text-sm text-white/70">
          Usamos <span className="font-semibold text-primary-200">Crunker</span> (2KB gzip) para concatenar os AudioBuffers e exportar um WAV pronto
          para download/testes, conforme descrito no documento de referência. Esta etapa também valida o pipeline antes de integrar com o
          WebAV Renderer.
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</p>
        )}

        {joinedAudio && (
          <div className="mt-6 space-y-4 rounded-3xl border border-primary-400/40 bg-primary-900/30 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-primary-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary-100">
                WAV combinado
              </span>
              <span className="text-sm text-primary-100/80">Duração {formatDuration(joinedAudio.durationMs)}</span>
            </div>
            <audio controls src={joinedAudio.url} className="w-full" preload="metadata" />
            <div className="flex flex-wrap gap-3">
              <a
                href={joinedAudio.url}
                download="audio-join-demo.wav"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:border-white/60"
              >
                Baixar WAV
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
