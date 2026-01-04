import { useEffect, useMemo, useRef, useState } from 'react';

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

const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;

  const wav = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wav);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const rawSample = buffer.getChannelData(channel)[i] ?? 0;
      const sample = Math.max(-1, Math.min(1, rawSample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([wav], { type: 'audio/wav' });
};

export function AudioSplitTestPage() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
    };
  }, [audioPreviewUrl]);

  useEffect(() => {
    return () => {
      segments.forEach((segment) => URL.revokeObjectURL(segment.url));
    };
  }, [segments]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
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
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined;

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
          const audioContext = new AudioContext();
          const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
          setAudioBuffer(decoded);
          setAudioDuration(decoded.duration);
          setSplitPoint(Number((decoded.duration / 2).toFixed(2)));
          await audioContext.close();
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

  const handleSplit = () => {
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

      const firstSegment: SplitSegment = {
        id: 'segment-a',
        label: 'Primeira parte',
        url: URL.createObjectURL(audioBufferToWav(firstSegmentBuffer)),
        start: 0,
        end: splitPoint,
        duration: splitPoint,
      };

      const secondSegment: SplitSegment = {
        id: 'segment-b',
        label: 'Segunda parte',
        url: URL.createObjectURL(audioBufferToWav(secondSegmentBuffer)),
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

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-medium text-white">1. Gravação</h2>
        <p className="mt-1 text-sm text-white/70">Capture um trecho curto para habilitar o slider.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleStartRecording}
            disabled={!canRecord || isRecording || isPreparingRecorder}
            className="rounded-full bg-primary-500 px-6 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-primary-500/40"
          >
            {isRecording ? 'Gravando…' : 'Iniciar gravação'}
          </button>
          <button
            type="button"
            onClick={handleStopRecording}
            disabled={!isRecording}
            className="rounded-full border border-white/30 px-6 py-2 text-sm font-semibold text-white/90 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
          >
            Parar
          </button>
          {isPreparingRecorder && (
            <span className="text-sm text-white/70">Solicitando acesso ao microfone…</span>
          )}
        </div>

        {audioPreviewUrl && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-white/70">
              Áudio gravado ({formatSeconds(audioDuration)})
            </p>
            <audio controls className="w-full" src={audioPreviewUrl} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-medium text-white">2. Defina o corte</h2>
        <p className="mt-1 text-sm text-white/70">
          O slider só habilita depois que o áudio for processado. Os limites seguem o tempo total da
          gravação.
        </p>

        <div className="mt-5 space-y-4">
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

        <button
          type="button"
          onClick={handleSplit}
          disabled={!audioBuffer || splitPoint <= 0 || splitPoint >= audioDuration || isProcessingSplit}
          className="mt-4 rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-accent-500/30"
        >
          {isProcessingSplit ? 'Processando…' : 'Split agora'}
        </button>
      </section>

      {segments.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-medium text-white">3. Prévia dos áudios</h2>
          <p className="mt-1 text-sm text-white/70">Ouça cada parte após o corte.</p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
          </div>
        </section>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
