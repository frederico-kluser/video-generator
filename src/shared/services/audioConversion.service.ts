/**
 * Serviço para gerenciar conversões de áudio para uso com WebAV.
 * Converte AudioBuffer → WAV → Blob para AudioClip.
 */

import { audioBufferToWAVBlob } from '@/shared/utils/webav.utils';
import { appLogger } from '@/shared/logging/logger';

export interface AudioConversionOptions {
  /** Taxa de amostragem desejada (default: 48000) */
  sampleRate?: number;
  /** Número de canais (1 = mono, 2 = stereo) */
  channels?: number;
  /** Normalizar volume */
  normalize?: boolean;
}

/**
 * Converte AudioBuffer para formato compatível com WebAV AudioClip.
 */
export async function convertAudioBufferForWebAV(
  audioBuffer: AudioBuffer,
  options: AudioConversionOptions = {},
): Promise<Blob> {
  const {
    sampleRate = 48000,
    channels = 1,
    normalize = false,
  } = options;

  appLogger.info('🔄 Converting AudioBuffer for WebAV', {
    originalSampleRate: audioBuffer.sampleRate,
    originalChannels: audioBuffer.numberOfChannels,
    targetSampleRate: sampleRate,
    targetChannels: channels,
    duration: audioBuffer.duration,
  });

  let processedBuffer = audioBuffer;

  // Resample se necessário
  if (audioBuffer.sampleRate !== sampleRate) {
    processedBuffer = await resampleAudioBuffer(audioBuffer, sampleRate);
  }

  // Converter para mono se necessário
  if (channels === 1 && processedBuffer.numberOfChannels > 1) {
    processedBuffer = convertToMono(processedBuffer);
  }

  // Normalizar se solicitado
  if (normalize) {
    processedBuffer = normalizeAudioBuffer(processedBuffer);
  }

  // Converter para WAV Blob
  const wavBlob = await audioBufferToWAVBlob(processedBuffer);

  appLogger.info('✅ AudioBuffer converted successfully', {
    blobSize: wavBlob.size,
    blobType: wavBlob.type,
  });

  return wavBlob;
}

/**
 * Reamostrar AudioBuffer para nova taxa de amostragem.
 */
async function resampleAudioBuffer(
  audioBuffer: AudioBuffer,
  targetSampleRate: number,
): Promise<AudioBuffer> {
  const offlineContext = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    Math.ceil((audioBuffer.length * targetSampleRate) / audioBuffer.sampleRate),
    targetSampleRate,
  );

  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start(0);

  const resampled = await offlineContext.startRendering();

  appLogger.info('🔄 Audio resampled', {
    originalRate: audioBuffer.sampleRate,
    targetRate: targetSampleRate,
    originalLength: audioBuffer.length,
    newLength: resampled.length,
  });

  return resampled;
}

/**
 * Converte AudioBuffer multicanal para mono.
 */
function convertToMono(audioBuffer: AudioBuffer): AudioBuffer {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;

  // Criar novo buffer mono
  const monoBuffer = new AudioBuffer({
    numberOfChannels: 1,
    length,
    sampleRate,
  });

  const monoData = monoBuffer.getChannelData(0);

  // Mixar todos os canais
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let channel = 0; channel < numberOfChannels; channel++) {
      sum += audioBuffer.getChannelData(channel)[i] ?? 0;
    }
    monoData[i] = sum / numberOfChannels;
  }

  appLogger.info('🔄 Audio converted to mono', {
    originalChannels: numberOfChannels,
  });

  return monoBuffer;
}

/**
 * Normaliza o volume do AudioBuffer para evitar clipping.
 */
function normalizeAudioBuffer(audioBuffer: AudioBuffer): AudioBuffer {
  const normalized = new AudioBuffer({
    numberOfChannels: audioBuffer.numberOfChannels,
    length: audioBuffer.length,
    sampleRate: audioBuffer.sampleRate,
  });

  // Encontrar pico máximo
  let maxPeak = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      maxPeak = Math.max(maxPeak, Math.abs(data[i] ?? 0));
    }
  }

  // Aplicar normalização (com headroom de -0.1dB)
  const gain = maxPeak > 0 ? 0.95 / maxPeak : 1;

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const sourceData = audioBuffer.getChannelData(channel);
    const targetData = normalized.getChannelData(channel);
    for (let i = 0; i < sourceData.length; i++) {
      targetData[i] = (sourceData[i] ?? 0) * gain;
    }
  }

  appLogger.info('🔄 Audio normalized', {
    maxPeak,
    gain: `${(20 * Math.log10(gain)).toFixed(2)} dB`,
  });

  return normalized;
}

/**
 * Converte Blob de áudio para AudioBuffer (para processamento).
 */
export async function blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  audioContext.close();

  return audioBuffer;
}

/**
 * Valida se o AudioBuffer tem sinal válido (não é silêncio).
 */
export function validateAudioBufferHasSignal(audioBuffer: AudioBuffer): boolean {
  const threshold = 0.001; // -60dB
  let hasSamples = false;

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i] ?? 0) > threshold) {
        hasSamples = true;
        break;
      }
    }
    if (hasSamples) break;
  }

  if (!hasSamples) {
    appLogger.warn('⚠️ AudioBuffer has no signal (silence detected)');
  }

  return hasSamples;
}
