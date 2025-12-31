import { getEnv } from '@/config/env';
import { appLogger } from '@/shared/logging/logger';

export type CleanupPreset = 'sherpa-onnx' | 'arnndn-lq' | 'deepfilternet';

export type CleanupDiagnostics = {
  preset: CleanupPreset;
  backendLabel: string;
  processingTimeMs?: number;
  snrImprovementDb?: number;
};

export const CLEANUP_PIPELINE_PRESETS: Record<
  CleanupPreset,
  {
    label: string;
    description: string;
    badge: string;
    backendLabel: string;
  }
> = {
  'sherpa-onnx': {
    label: 'Sherpa-ONNX GTCRN',
    description:
      'Bindings nativos + modelo GTCRN com Silero VAD. Menor latência mantendo naturalidade.',
    badge: 'Tempo real',
    backendLabel: 'GTCRN (sherpa-onnx)',
  },
  'arnndn-lq': {
    label: 'FFmpeg arnndn (lq)',
    description:
      'FFmpeg 6.1 + filtro RNNoise arnndn com modelo lq.rnnn, ideal para ruído constante.',
    badge: 'LQ hiss',
    backendLabel: 'FFmpeg arnndn',
  },
  deepfilternet: {
    label: 'DeepFilterNet',
    description:
      'Serviço Python FastAPI com DeepFilterNet3 para máxima qualidade (PESQ 3.04).',
    badge: 'HiFi',
    backendLabel: 'DeepFilterNet',
  },
};

const CLEANUP_ENDPOINT_PATH = '/audio/cleanup';

type RequestNoiseCleanupOptions = {
  preset?: CleanupPreset;
  signal?: AbortSignal;
  fileName?: string;
  apiBaseUrl?: string;
};

export async function requestNoiseCleanup(
  audioBlob: Blob,
  options: RequestNoiseCleanupOptions = {},
): Promise<{ blob: Blob; diagnostics: CleanupDiagnostics }> {
  const { apiUrl } = getEnv();
  const baseUrl = options.apiBaseUrl ?? apiUrl;

  if (!baseUrl) {
    throw new Error(
      'VITE_API_URL não configurada. Configure o backend sherpa-onnx/arnndn para habilitar o Audio Cleanup Lab.',
    );
  }

  const preset = options.preset ?? 'sherpa-onnx';
  const endpoint = buildEndpoint(baseUrl);

  const formData = new FormData();
  formData.append('audio', audioBlob, options.fileName ?? 'sample.webm');
  formData.append('preset', preset);
  formData.append('format', 'wav');

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
    signal: options.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    appLogger.error('💥 Falha ao limpar áudio no backend.', {
      status: response.status,
      preset,
      endpoint,
      errorBody,
    });
    throw new Error(
      `Falha ao processar áudio (status ${response.status}). Verifique o backend de limpeza.`,
    );
  }

  const cleanedBlob = await response.blob();
  const diagnostics = extractDiagnostics(response, preset);
  appLogger.info('🧼 Áudio tratado com sucesso no backend.', diagnostics);

  return { blob: cleanedBlob, diagnostics };
}

function buildEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, '')}${CLEANUP_ENDPOINT_PATH}`;
}

function extractDiagnostics(
  response: Response,
  preset: CleanupPreset,
): CleanupDiagnostics {
  const headers = response.headers;
  const processingTimeMs = getNumericHeader(
    headers.get('x-processing-time-ms'),
  );
  const snrImprovementDb = getNumericHeader(
    headers.get('x-snr-improvement-db'),
  );
  const backendLabel =
    headers.get('x-cleanup-backend') ??
    CLEANUP_PIPELINE_PRESETS[preset]?.backendLabel ??
    'Pipeline remoto';

  return {
    preset,
    backendLabel,
    processingTimeMs,
    snrImprovementDb,
  };
}

function getNumericHeader(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
