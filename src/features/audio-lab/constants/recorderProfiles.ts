export type RecorderProfileId =
  | 'native-baseline'
  | 'web-audio-chain'
  | 'wav-lossless'
  | 'full-studio-stack';

export type RecorderPipelineOptions = {
  recorderKind: 'native-media-recorder' | 'extendable-wav';
  mimeType: string;
  bitrate?: number;
  highPassHz?: number;
  includeNoiseGate?: boolean;
  includeRnnoise?: boolean;
  includeCompressor?: boolean;
  includeLimiter?: boolean;
  includeProcessingGraph?: boolean;
  autoStopOnSilence?: boolean;
  silenceThresholdMs?: number;
  minActiveMs?: number;
};

export type RecorderProfileDefinition = {
  id: RecorderProfileId;
  title: string;
  description: string;
  goal: string;
  technologies: string[];
  pipeline: RecorderPipelineOptions;
  codecLabel: string;
  formatLabel: string;
};

export const RECORDER_PROFILES: RecorderProfileDefinition[] = [
  {
    id: 'native-baseline',
    title: 'Baseline do Navegador',
    description:
      'Gravação direta com MediaRecorder em Opus 64 kbps para servir como referência do que o browser entrega sozinho.',
    goal: 'Comparar os demais pipelines contra a captação pura.',
    technologies: ['MediaRecorder API', 'Opus mono 64 kbps', 'Sem filtros adicionais'],
    pipeline: {
      recorderKind: 'native-media-recorder',
      mimeType: 'audio/webm;codecs=opus',
      bitrate: 64_000,
    },
    codecLabel: 'Opus 48 kHz / 64 kbps',
    formatLabel: 'WEBM',
  },
  {
    id: 'web-audio-chain',
    title: 'Web Audio + Filtros',
    description:
      'Aplica o chain do guia (high-pass 85 Hz + compressor + limiter) antes de gravar com MediaRecorder.',
    goal: 'Mostrar o ganho de estabilidade só com DSP nativo.',
    technologies: [
      'High-pass 85 Hz',
      'DynamicsCompressor (-20 dB / 4:1)',
      'Limiter -3 dB',
      'MediaRecorder Opus',
    ],
    pipeline: {
      recorderKind: 'native-media-recorder',
      mimeType: 'audio/webm;codecs=opus',
      bitrate: 64_000,
      highPassHz: 85,
      includeCompressor: true,
      includeLimiter: true,
      includeProcessingGraph: true,
    },
    codecLabel: 'Opus 48 kHz / 64 kbps',
    formatLabel: 'WEBM',
  },
  {
    id: 'wav-lossless',
    title: 'WAV Lossless (extendable)',
    description:
      'Registra áudio em WAV 16-bit/48 kHz usando extendable-media-recorder antes de qualquer compressão.',
    goal: 'Garantir arquivo de arquivamento sem perdas.',
    technologies: ['extendable-media-recorder', 'WAV 16-bit', 'Encoder AudioWorklet'],
    pipeline: {
      recorderKind: 'extendable-wav',
      mimeType: 'audio/wav',
      highPassHz: 85,
    },
    codecLabel: 'PCM 48 kHz / 16-bit',
    formatLabel: 'WAV',
  },
  {
    id: 'full-studio-stack',
    title: 'Stack Completa com RNNoise + VAD',
    description:
      'Pipeline máximo descrito no doc: noise gate, RNNoise, compressor, limiter, WAV lossless e auto-stop por silêncio.',
    goal: 'Chegar na “gravação perfeita” aplicando todas as camadas.',
    technologies: [
      '@sapphi-red/web-noise-suppressor',
      'RNNoise Worklet',
      'Noise gate -45 dB',
      'High-pass 85 Hz',
      'Comp + limiter',
      'Native VAD 48 kHz com auto-stop',
      'extendable-media-recorder WAV',
    ],
    pipeline: {
      recorderKind: 'extendable-wav',
      mimeType: 'audio/wav',
      highPassHz: 85,
      includeNoiseGate: true,
      includeRnnoise: true,
      includeCompressor: true,
      includeLimiter: true,
      includeProcessingGraph: true,
      autoStopOnSilence: true,
      silenceThresholdMs: 5000,
      minActiveMs: 2000,
    },
    codecLabel: 'PCM 48 kHz / 16-bit',
    formatLabel: 'WAV',
  },
];
