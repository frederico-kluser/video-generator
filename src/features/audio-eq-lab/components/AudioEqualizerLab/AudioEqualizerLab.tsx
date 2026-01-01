import { useEffect, useMemo, useRef, useState } from 'react';

import {
  AlertTriangle,
  ArrowLeft,
  Mic,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Waves,
} from 'lucide-react';

import {
  createRecorderBundle,
  getPreferredMimeType,
  getVoiceMediaConstraints,
  safeStopRecorder,
  useObjectUrl,
} from '@/features/audio-lab/lib/mediaUtils';
import { appLogger } from '@/shared/logging/logger';

const TAKE_COUNT = 3;
const TARGET_SAMPLE_RATE = 48_000;
const DEFAULT_EQ_SETTINGS: EqSettings = {
  low: 3,
  mid: 0,
  high: 2,
};

const AUDIO_CONTEXT_ERROR =
  'API de áudio não suportada neste navegador. Utilize Chrome, Edge ou Firefox.';

const SHOULD_VALIDATE_BUFFERS =
  typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
const OFFLINE_RENDER_TIMEOUT_MS = 30_000;
const SILENCE_THRESHOLD = 0.0001;
const MAX_EQ_GAIN_DB = 24;
const EQ_CHUNK_DURATION_SECONDS = 60;

type TakeState = {
  index: number;
  label: string;
  blob: Blob | null;
  status: 'idle' | 'recording' | 'ready';
};

type EqSettings = {
  low: number;
  mid: number;
  high: number;
};

type MixResult = {
  raw: Blob;
  equalized: Blob;
};

const sanitizeEqSettings = (settings: EqSettings): EqSettings => ({
  low: clampEqGain(settings.low),
  mid: clampEqGain(settings.mid),
  high: clampEqGain(settings.high),
});

const clampEqGain = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-MAX_EQ_GAIN_DB, Math.min(MAX_EQ_GAIN_DB, value));
};

export function AudioEqualizerLab() {
  const [takes, setTakes] = useState<TakeState[]>(() =>
    Array.from({ length: TAKE_COUNT }, (_, index) => ({
      index,
      label: `Take ${index + 1}`,
      blob: null,
      status: 'idle',
    })),
  );
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<
    'idle' | 'preparing' | 'recording' | 'mixing'
  >('idle');
  const [mixError, setMixError] = useState<string | null>(null);
  const [rawMix, setRawMix] = useState<Blob | null>(null);
  const [equalizedMix, setEqualizedMix] = useState<Blob | null>(null);
  const [eqSettings, setEqSettings] = useState<EqSettings>(DEFAULT_EQ_SETTINGS);

  const preferredMimeTypeRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const completionRef = useRef<Promise<Blob> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    preferredMimeTypeRef.current = getPreferredMimeType();
  }, []);

  useEffect(() => {
    return () => {
      safeStopRecorder(recorderRef.current);
      cleanupActiveCapture();
    };
  }, []);

  const rawMixUrl = useObjectUrl(rawMix);
  const equalizedMixUrl = useObjectUrl(equalizedMix);

  const supportsRecording = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices) &&
      typeof MediaRecorder !== 'undefined',
    [],
  );

  const allTakesReady = takes.every((take) => Boolean(take.blob));
  const isBusy = phase === 'preparing' || phase === 'mixing';

  const handleToggleRecording = async (takeIndex: number) => {
    if (!supportsRecording || isBusy) {
      return;
    }

    if (recordingIndex === takeIndex) {
      await stopActiveRecording();
      return;
    }

    await startRecording(takeIndex);
  };

  const startRecording = async (takeIndex: number) => {
    if (!supportsRecording) {
      setMixError('Seu navegador não suporta MediaRecorder.');
      return;
    }

    try {
      setPhase('preparing');
      setMixError(null);
      setRawMix(null);
      setEqualizedMix(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getVoiceMediaConstraints(),
      });
      mediaStreamRef.current = stream;

      const bundle = createRecorderBundle(stream, preferredMimeTypeRef.current);
      recorderRef.current = bundle.recorder;
      completionRef.current = bundle.completion;

      setRecordingIndex(takeIndex);
      setPhase('recording');
      setTakes((prev) =>
        prev.map((take) =>
          take.index === takeIndex
            ? { ...take, status: 'recording', blob: null }
            : take,
        ),
      );

      appLogger.info('🎛️ Iniciando take no Equalizer Lab.', {
        take: takeIndex + 1,
      });
    } catch (error) {
      setPhase('idle');
      setMixError(
        'Não foi possível acessar o microfone. Verifique permissões.',
      );
      appLogger.error('💥 Falha ao iniciar take no Equalizer Lab.', { error });
      cleanupActiveCapture();
    }
  };

  const stopActiveRecording = async () => {
    if (recordingIndex === null) {
      return;
    }

    setPhase('recording');

    const currentIndex = recordingIndex;
    safeStopRecorder(recorderRef.current);

    const completion = completionRef.current;
    if (!completion) {
      setMixError('Não encontramos o buffer da gravação atual.');
      cleanupActiveCapture();
      recorderRef.current = null;
      setRecordingIndex(null);
      setPhase('idle');
      return;
    }

    try {
      const blob = await completion;
      setTakes((prev) =>
        prev.map((take) =>
          take.index === currentIndex
            ? { ...take, blob: blob ?? null, status: blob ? 'ready' : 'idle' }
            : take,
        ),
      );
      if (blob) {
        appLogger.info('✅ Take gravado no Equalizer Lab.', {
          take: currentIndex + 1,
        });
      }
    } catch (error) {
      setMixError('Erro ao finalizar a gravação. Tente novamente.');
      appLogger.error('💥 Falha ao finalizar take no Equalizer Lab.', {
        error,
      });
    } finally {
      cleanupActiveCapture();
      recorderRef.current = null;
      completionRef.current = null;
      setRecordingIndex(null);
      setPhase('idle');
    }
  };

  const cleanupActiveCapture = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const handleRemoveTake = (takeIndex: number) => {
    if (recordingIndex === takeIndex) {
      return;
    }

    setTakes((prev) =>
      prev.map((take) =>
        take.index === takeIndex
          ? { ...take, blob: null, status: 'idle' }
          : take,
      ),
    );
  };

  const handleMix = async () => {
    if (!allTakesReady || phase === 'mixing') {
      return;
    }

    const blobs = takes.map((take) => take.blob).filter(Boolean) as Blob[];
    if (blobs.length !== TAKE_COUNT) {
      setMixError('Grave os três takes antes de gerar a mix.');
      return;
    }

    setPhase('mixing');
    setMixError(null);
    setRawMix(null);
    setEqualizedMix(null);

    try {
      const result = await mixRecordings(blobs, eqSettings);
      setRawMix(result.raw);
      setEqualizedMix(result.equalized);
      appLogger.info('🎚️ Mix gerada com sucesso no Equalizer Lab.', {
        takes: blobs.length,
        eq: eqSettings,
      });
    } catch (error) {
      setMixError('Não foi possível gerar a mix. Consulte o console.');
      appLogger.error('💥 Falha ao mixar takes no Equalizer Lab.', { error });
    } finally {
      setPhase('idle');
    }
  };

  const handleEqChange = (band: keyof EqSettings, value: number) => {
    setEqSettings((prev) => ({ ...prev, [band]: value }));
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-16">
      <div className="glass-card flex flex-col gap-4 rounded-3xl border border-primary-500/40 bg-dark-900/70 p-6 text-white">
        <div className="flex items-center gap-3 text-primary-200">
          <SlidersHorizontal size={20} />
          <span className="text-sm font-semibold uppercase tracking-[0.2em]">
            Audio Equalizer Lab
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white">
          Empilhe 3 takes e teste o EQ
        </h1>
        <p className="text-base text-white/70">
          Grave três takes rápidos e gere duas mixagens: a soma bruta e a soma
          equalizada com filtros shelves/peaking baseados em BiquadFilterNode
          (referência MDN). Ajuste o ganho de cada faixa e valide se o
          equilíbrio tonal está confortável antes de voltar para o fluxo
          principal.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-primary-300 transition hover:text-primary-200"
        >
          <ArrowLeft size={16} /> Voltar
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40">
                Equalizador
              </p>
              <h2 className="text-2xl font-semibold text-white">
                Ganho por banda
              </h2>
            </div>
            <Sparkles size={20} className="text-primary-300" />
          </div>
          <EqSlider
            label="Baixas (120 Hz)"
            value={eqSettings.low}
            onChange={(value) => handleEqChange('low', value)}
          />
          <EqSlider
            label="Médias (1 kHz)"
            value={eqSettings.mid}
            onChange={(value) => handleEqChange('mid', value)}
          />
          <EqSlider
            label="Altas (6 kHz)"
            value={eqSettings.high}
            onChange={(value) => handleEqChange('high', value)}
          />
          <p className="text-xs text-white/50">
            Cada slider aplica filtros `lowshelf`, `peaking` e `highshelf` via
            Web Audio API. Valores em dB variam entre -12 e +12, conforme
            recomenda a documentação do BiquadFilterNode.
          </p>
        </div>

        <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40">
                Status
              </p>
              <h2 className="text-2xl font-semibold text-white">
                {phase === 'mixing'
                  ? 'Gerando mix…'
                  : recordingIndex !== null
                    ? `Gravando ${takes[recordingIndex]?.label}`
                    : 'Aguardando ações'}
              </h2>
            </div>
            <Waves size={20} className="text-primary-300" />
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-white/60">
            <StatusChip
              label="MediaRecorder"
              value={supportsRecording ? 'Disponível' : 'Indisponível'}
            />
            <StatusChip
              label="Takes"
              value={`${takes.filter((take) => take.blob).length}/${TAKE_COUNT}`}
            />
            <StatusChip
              label="Pipeline"
              value={phase === 'mixing' ? 'Mixando' : 'Pronto'}
            />
          </div>
          <button
            type="button"
            onClick={handleMix}
            disabled={!allTakesReady || isBusy}
            className={`btn-primary mt-auto w-full ${
              (!allTakesReady || isBusy) && 'cursor-not-allowed opacity-60'
            }`}
          >
            Gerar mix com equalização
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {takes.map((take) => (
          <TakeCard
            key={take.index}
            take={take}
            isRecording={recordingIndex === take.index}
            onToggleRecording={() => handleToggleRecording(take.index)}
            onRemove={() => handleRemoveTake(take.index)}
            disabled={!supportsRecording || isBusy}
          />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <MixPanel
          title="Mix bruta"
          subtitle="3 takes concatenados"
          badge="Sem EQ"
          color="from-accent-500/40 to-accent-700/30"
          audioUrl={rawMixUrl}
          emptyText="Grave e gere a mix para ouvir o resultado bruto."
        />
        <MixPanel
          title="Mix equalizada"
          subtitle="Filtros shelves + peaking"
          badge="Com EQ"
          color="from-primary-500/40 to-primary-700/30"
          audioUrl={equalizedMixUrl}
          emptyText="Use o botão Gerar mix para aplicar a equalização."
        />
      </div>

      {mixError && (
        <div className="glass-card flex items-center gap-3 rounded-3xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm text-danger-100">
          <AlertTriangle size={18} />
          <span>{mixError}</span>
        </div>
      )}
    </div>
  );
}

type EqSliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

function EqSlider({ label, value, onChange }: EqSliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>{label}</span>
        <span>{value.toFixed(1)} dB</span>
      </div>
      <input
        type="range"
        min={-12}
        max={12}
        step={0.5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-primary-400"
      />
    </div>
  );
}

type StatusChipProps = {
  label: string;
  value: string;
};

function StatusChip({ label, value }: StatusChipProps) {
  return (
    <div className="rounded-full border border-white/10 px-3 py-1 text-xs">
      <span className="text-white/40">{label}: </span>
      <span className="text-white">{value}</span>
    </div>
  );
}

type TakeCardProps = {
  take: TakeState;
  isRecording: boolean;
  onToggleRecording: () => void;
  onRemove: () => void;
  disabled: boolean;
};

function TakeCard({
  take,
  isRecording,
  onToggleRecording,
  onRemove,
  disabled,
}: TakeCardProps) {
  const audioUrl = useObjectUrl(take.blob);

  return (
    <div className="glass-card flex flex-col gap-3 rounded-3xl border border-white/5 bg-dark-900/80 p-5 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/40">
            Take
          </p>
          <h3 className="text-xl font-semibold text-white">{take.label}</h3>
        </div>
        <StatusChip
          label="Status"
          value={take.status === 'ready' ? 'OK' : take.status}
        />
      </div>

      {audioUrl ? (
        <audio controls className="w-full">
          <source src={audioUrl} />
        </audio>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
          <p>Ainda sem gravação.</p>
        </div>
      )}

      <div className="mt-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleRecording}
          disabled={disabled}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            disabled
              ? 'cursor-not-allowed opacity-40'
              : isRecording
                ? 'bg-gradient-to-r from-danger-500 to-danger-600 text-white'
                : 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
          }`}
        >
          {isRecording ? (
            <>
              <Square size={16} /> Parar
            </>
          ) : (
            <>
              <Mic size={16} /> Gravar
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={isRecording || disabled}
          className="btn-icon h-11 w-11 border-white/10 text-white/60 hover:text-danger-400"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

type MixPanelProps = {
  title: string;
  subtitle: string;
  badge: string;
  color: string;
  audioUrl: string | null;
  emptyText: string;
};

function MixPanel({
  title,
  subtitle,
  badge,
  color,
  audioUrl,
  emptyText,
}: MixPanelProps) {
  return (
    <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white/60">{subtitle}</p>
          <h2 className="text-2xl font-semibold text-white">{title}</h2>
        </div>
        <span
          className={`rounded-full bg-gradient-to-r ${color} px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/90`}
        >
          {badge}
        </span>
      </div>
      {audioUrl ? (
        <audio controls className="w-full">
          <source src={audioUrl} />
        </audio>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-white/60">
          <p>{emptyText}</p>
        </div>
      )}
    </div>
  );
}

function ensureBlobHasAudio(blob: Blob | null, index: number) {
  if (!blob || blob.size === 0) {
    throw new Error(`Take ${index + 1} está vazio ou corrompido.`);
  }
}

async function decodeBlobToBuffer(
  blob: Blob,
  context: AudioContext,
  stageName: string,
): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
  debugValidateBuffer(buffer, stageName);
  ensureBufferHasSignal(buffer, stageName);
  return buffer;
}

function debugValidateBuffer(buffer: AudioBuffer, stageName: string): boolean {
  if (!buffer || buffer.length === 0) {
    appLogger.warn('⚠️ Buffer vazio detectado.', { stage: stageName });
    return false;
  }

  if (!SHOULD_VALIDATE_BUFFERS) {
    return true;
  }

  console.group(`[AudioEqualizerLab] ${stageName}`);
  console.log('Channels:', buffer.numberOfChannels);
  console.log('Length:', buffer.length, 'frames');
  console.log('Duration:', buffer.duration.toFixed(3), 's');
  console.log('Sample Rate:', buffer.sampleRate);

  let isSilent = true;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    let peak = 0;
    let sumSquares = 0;
    let hasNaN = false;

    for (let index = 0; index < data.length; index += 1) {
      const rawValue = data[index];
      const value = typeof rawValue === 'number' ? rawValue : 0;
      if (Number.isNaN(value)) {
        hasNaN = true;
        break;
      }
      const abs = Math.abs(value);
      if (abs > peak) {
        peak = abs;
      }
      sumSquares += value * value;
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, data.length));
    if (peak > SILENCE_THRESHOLD) {
      isSilent = false;
    }

    console.log(
      `Ch${channel}: peak=${peak.toFixed(4)}, RMS=${rms.toFixed(4)}, NaN=${hasNaN}`,
    );
  }

  if (isSilent) {
    console.error('⚠️ BUFFER IS SILENT');
    appLogger.warn('⚠️ Buffer silencioso detectado no pipeline.', {
      stage: stageName,
    });
  }

  console.groupEnd();
  return !isSilent;
}

function ensureBufferHasSignal(
  buffer: AudioBuffer | null,
  stageName: string,
): asserts buffer is AudioBuffer {
  if (!buffer || buffer.length === 0) {
    const error = new Error(
      `${stageName} retornou um buffer vazio ou inexistente.`,
    );
    appLogger.error('💥 Buffer inválido detectado.', {
      stage: stageName,
      error,
    });
    throw error;
  }

  let hasSignal = false;

  outer: for (
    let channel = 0;
    channel < buffer.numberOfChannels;
    channel += 1
  ) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index];
      if (!Number.isFinite(value)) {
        const error = new Error(
          `${stageName} contém valores inválidos no canal ${channel}.`,
        );
        appLogger.error('💥 Buffer contém NaN/Infinity.', {
          stage: stageName,
          channel,
          sampleIndex: index,
        });
        throw error;
      }

      if (Math.abs(value) > SILENCE_THRESHOLD) {
        hasSignal = true;
        break outer;
      }
    }
  }

  if (!hasSignal) {
    const error = new Error(
      `${stageName} resultou em silêncio detectável (peak <= ${SILENCE_THRESHOLD}).`,
    );
    appLogger.warn('🔇 Buffer silencioso bloqueado.', {
      stage: stageName,
      threshold: SILENCE_THRESHOLD,
    });
    throw error;
  }
}

async function renderOfflineWithTimeout(
  offlineCtx: OfflineAudioContext,
  stageName: string,
  timeoutMs = OFFLINE_RENDER_TIMEOUT_MS,
): Promise<AudioBuffer> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${stageName} excedeu ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const renderPromise = offlineCtx.startRendering();
    const buffer = await Promise.race([renderPromise, timeoutPromise]);
    return buffer;
  } catch (error) {
    appLogger.error('💥 Renderização offline falhou.', {
      stage: stageName,
      error,
    });
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function verifyGraphBeforeRender(
  source: AudioBufferSourceNode,
  filters: AudioNode[],
  destination: AudioNode,
) {
  if (!source.buffer || source.buffer.length === 0) {
    throw new Error('Source buffer ausente antes da renderização offline.');
  }

  if (!destination) {
    throw new Error('Destino não conectado ao OfflineAudioContext.');
  }

  if (destination.context !== source.context) {
    throw new Error('Source e destino pertencem a contextos diferentes.');
  }

  if (SHOULD_VALIDATE_BUFFERS) {
    filters.forEach((filter, index) => {
      if (filter instanceof BiquadFilterNode) {
        console.log(`[AudioEqualizerLab] Filter ${index + 1}`, {
          type: filter.type,
          freq: filter.frequency.value,
          Q: filter.Q.value,
          gain: filter.gain.value,
        });
      }
    });
  }

  filters.forEach((filter) => {
    if (filter instanceof BiquadFilterNode) {
      const nyquist = filter.context.sampleRate / 2;
      const freq = filter.frequency.value;
      if (freq <= 0 || freq >= nyquist) {
        throw new Error(
          `Filtro com frequência fora do intervalo seguro: ${freq}Hz.`,
        );
      }
      if (filter.type === 'peaking' && filter.Q.value <= 0) {
        filter.Q.value = 0.0001;
      }
    }
  });
}

async function mixRecordings(
  blobs: Blob[],
  eqSettings: EqSettings,
): Promise<MixResult> {
  const AudioContextCtor = getAudioContextCtor();

  if (!AudioContextCtor) {
    throw new Error(AUDIO_CONTEXT_ERROR);
  }

  const decodeContext = new AudioContextCtor({
    sampleRate: TARGET_SAMPLE_RATE,
  });
  try {
    const normalizedEqSettings = sanitizeEqSettings(eqSettings);
    const processedBuffers: AudioBuffer[] = [];
    for (const [index, blob] of blobs.entries()) {
      ensureBlobHasAudio(blob, index);
      const decoded = await decodeBlobToBuffer(
        blob,
        decodeContext,
        `Take ${index + 1} · decode`,
      );
      const mono = convertToMono(decoded);
      debugValidateBuffer(mono, `Take ${index + 1} · mono`);
      ensureBufferHasSignal(mono, `Take ${index + 1} · mono`);
      const resampled = await resampleBuffer(
        mono,
        TARGET_SAMPLE_RATE,
        `Take ${index + 1}`,
      );
      debugValidateBuffer(resampled, `Take ${index + 1} · resampled`);
      ensureBufferHasSignal(resampled, `Take ${index + 1} · resampled`);
      processedBuffers.push(resampled);
    }

    const combined = concatenateBuffers(processedBuffers, TARGET_SAMPLE_RATE);
    debugValidateBuffer(combined, 'After concatenate');

    ensureBufferHasSignal(combined, 'After concatenate');

    const equalized = await applyEqualizer(combined, normalizedEqSettings);
    debugValidateBuffer(equalized, 'After applyEqualizer');
    ensureBufferHasSignal(equalized, 'After applyEqualizer');

    return {
      raw: audioBufferToWaveBlob(combined),
      equalized: audioBufferToWaveBlob(equalized),
    };
  } finally {
    await decodeContext.close().catch(() => undefined);
  }
}

function convertToMono(buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels === 1) {
    return buffer;
  }

  const monoBuffer = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: 1,
    sampleRate: buffer.sampleRate,
  });

  const output = monoBuffer.getChannelData(0);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const input = buffer.getChannelData(channel);
    for (let i = 0; i < input.length; i += 1) {
      const rawSample = input[i];
      const sample = typeof rawSample === 'number' ? rawSample : 0;
      const current = output[i] ?? 0;
      output[i] = current + sample / Math.max(1, buffer.numberOfChannels);
    }
  }

  return monoBuffer;
}

async function resampleBuffer(
  buffer: AudioBuffer,
  targetSampleRate: number,
  stageLabel = 'Resample',
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate) {
    return buffer;
  }

  const OfflineAudioContextCtor = getOfflineAudioContextCtor();

  if (!OfflineAudioContextCtor) {
    appLogger.warn(
      'ℹ️ OfflineAudioContext indisponível; mantendo sample rate original.',
    );
    debugValidateBuffer(buffer, `${stageLabel} · resample fallback`);
    return buffer;
  }

  const frameCount = Math.ceil(buffer.duration * targetSampleRate);
  const offline = new OfflineAudioContextCtor(1, frameCount, targetSampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  verifyGraphBeforeRender(source, [], offline.destination);
  source.start(0);

  const rendered = await renderOfflineWithTimeout(
    offline,
    `${stageLabel} · resample`,
  );
  debugValidateBuffer(rendered, `${stageLabel} · resampled`);
  return rendered;
}

function concatenateBuffers(
  buffers: AudioBuffer[],
  sampleRate: number,
): AudioBuffer {
  if (buffers.length === 0) {
    return new AudioBuffer({
      length: 0,
      numberOfChannels: 1,
      sampleRate,
    });
  }

  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const numberOfChannels = buffers[0].numberOfChannels;
  const output = new AudioBuffer({
    length: totalLength,
    numberOfChannels,
    sampleRate,
  });

  let offset = 0;
  for (const buffer of buffers) {
    if (buffer.sampleRate !== sampleRate) {
      throw new Error(
        'Buffers com sample rates diferentes não podem ser concatenados.',
      );
    }

    if (buffer.numberOfChannels !== numberOfChannels) {
      throw new Error(
        'Buffers com número de canais diferentes não podem ser concatenados.',
      );
    }

    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const target = output.getChannelData(channel);
      target.set(buffer.getChannelData(channel), offset);
    }
    offset += buffer.length;
  }
  return output;
}

async function applyEqualizer(
  buffer: AudioBuffer,
  settings: EqSettings,
): Promise<AudioBuffer> {
  const OfflineAudioContextCtor = getOfflineAudioContextCtor();

  if (!OfflineAudioContextCtor) {
    appLogger.warn(
      '🎚️ OfflineAudioContext indisponível; retornando mix sem EQ.',
    );
    return buffer;
  }

  const normalizedSettings = sanitizeEqSettings(settings);

  const renderChunk = async (
    chunkBuffer: AudioBuffer,
    label: string,
  ): Promise<AudioBuffer> => {
    const offline = new OfflineAudioContextCtor(
      chunkBuffer.numberOfChannels,
      chunkBuffer.length,
      chunkBuffer.sampleRate,
    );
    const source = offline.createBufferSource();
    source.buffer = chunkBuffer;

    const low = offline.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 120;
    low.gain.value = normalizedSettings.low;

    const mid = offline.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1_000;
    mid.Q.value = 1;
    mid.gain.value = normalizedSettings.mid;

    const high = offline.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 6_000;
    high.gain.value = normalizedSettings.high;

    source.connect(low).connect(mid).connect(high).connect(offline.destination);
    verifyGraphBeforeRender(source, [low, mid, high], offline.destination);
    source.start(0);

    const rendered = await renderOfflineWithTimeout(offline, label);
    debugValidateBuffer(rendered, `${label} · output`);
    ensureBufferHasSignal(rendered, `${label} · output`);
    return rendered;
  };

  if (buffer.duration <= EQ_CHUNK_DURATION_SECONDS) {
    return renderChunk(buffer, 'Equalizer render');
  }

  const chunkLength = Math.ceil(EQ_CHUNK_DURATION_SECONDS * buffer.sampleRate);
  const chunks: AudioBuffer[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < buffer.length) {
    const length = Math.min(chunkLength, buffer.length - offset);
    const chunkBuffer = new AudioBuffer({
      length,
      numberOfChannels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
    });

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const sourceData = buffer
        .getChannelData(channel)
        .subarray(offset, offset + length);
      chunkBuffer.copyToChannel(sourceData, channel);
    }

    chunkIndex += 1;
    const processedChunk = await renderChunk(
      chunkBuffer,
      `Equalizer chunk #${chunkIndex}`,
    );
    chunks.push(processedChunk);
    offset += length;
  }

  const stitched = concatenateBuffers(chunks, buffer.sampleRate);
  debugValidateBuffer(stitched, 'After applyEqualizer (chunked)');
  ensureBufferHasSignal(stitched, 'After applyEqualizer (chunked)');
  return stitched;
}

function audioBufferToWaveBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const channelData = buffer.getChannelData(channel);
      const rawSample = channelData[sampleIndex];
      const sample = typeof rawSample === 'number' ? rawSample : 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(
        offset,
        clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
        true,
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const candidate =
    window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
  return candidate ?? null;
}

function getOfflineAudioContextCtor(): typeof OfflineAudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const candidate =
    window.OfflineAudioContext ||
    (window as WebkitAudioWindow).webkitOfflineAudioContext;
  return candidate ?? null;
}
