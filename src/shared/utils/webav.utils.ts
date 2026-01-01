/**
 * Utilitários para conversão e validação de recursos com WebAV.
 */

import type {
  Microseconds,
  WebCodecsCapabilities,
} from '@/shared/types/webav.types';
import { appLogger } from '@/shared/logging/logger';

/**
 * Detecta capacidades do navegador para WebCodecs.
 */
export function detectWebCodecsCapabilities(): WebCodecsCapabilities {
  const hasVideoEncoder = typeof VideoEncoder !== 'undefined';
  const hasVideoDecoder = typeof VideoDecoder !== 'undefined';
  const hasAudioEncoder = typeof AudioEncoder !== 'undefined';
  const hasAudioDecoder = typeof AudioDecoder !== 'undefined';
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

  const supported =
    hasVideoEncoder &&
    hasVideoDecoder &&
    hasAudioEncoder &&
    hasAudioDecoder &&
    hasSharedArrayBuffer;

  const userAgent = navigator.userAgent;
  let browserName = 'Unknown';
  let browserVersion = '';

  if (/Chrome\/(\d+)/.test(userAgent)) {
    browserName = 'Chrome';
    browserVersion = RegExp.$1;
  } else if (/Edg\/(\d+)/.test(userAgent)) {
    browserName = 'Edge';
    browserVersion = RegExp.$1;
  } else if (/Firefox\/(\d+)/.test(userAgent)) {
    browserName = 'Firefox';
    browserVersion = RegExp.$1;
  } else if (/Safari\/(\d+)/.test(userAgent) && !/Chrome/.test(userAgent)) {
    browserName = 'Safari';
    browserVersion = RegExp.$1;
  }

  appLogger.info('🔍 WebCodecs capabilities detected', {
    supported,
    hasVideoEncoder,
    hasVideoDecoder,
    hasAudioEncoder,
    hasAudioDecoder,
    hasSharedArrayBuffer,
    browserName,
    browserVersion,
  });

  return {
    supported,
    hasVideoEncoder,
    hasVideoDecoder,
    hasAudioEncoder,
    hasAudioDecoder,
    hasSharedArrayBuffer,
    browserName,
    browserVersion,
  };
}

/**
 * Converte AudioBuffer para Blob WAV para uso com WebAV AudioClip.
 */
export async function audioBufferToWAVBlob(
  audioBuffer: AudioBuffer,
): Promise<Blob> {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  // Cria buffer WAV
  const wavBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
  const view = new DataView(wavBuffer);

  // Header RIFF
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length * numberOfChannels * 2, true);
  writeString(view, 8, 'WAVE');

  // Subchunk "fmt "
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat (PCM)
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true); // ByteRate
  view.setUint16(32, numberOfChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // Subchunk "data"
  writeString(view, 36, 'data');
  view.setUint32(40, length * numberOfChannels * 2, true);

  // Escreve samples (interleaved)
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = channels[channel];
      if (!channelData) continue;
      const sample = Math.max(-1, Math.min(1, channelData[i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * Valida se o Blob é um formato suportado por WebAV.
 */
export function validateMediaFormat(
  blob: Blob,
  expectedType: 'image' | 'audio' | 'video',
): boolean {
  const supportedFormats = {
    image: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    audio: ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4'],
    video: ['video/mp4', 'video/webm'],
  };

  const isValid = supportedFormats[expectedType].some((mime) =>
    blob.type.includes(mime),
  );

  if (!isValid) {
    appLogger.warn(`⚠️ Format validation failed for ${expectedType}`, {
      receivedType: blob.type,
      expectedTypes: supportedFormats[expectedType],
    });
  }

  return isValid;
}

/**
 * Calcula duração total de múltiplos slides em microsegundos.
 */
export function calculateTotalDuration(
  durations: Microseconds[],
): Microseconds {
  return durations.reduce((sum, d) => sum + d, 0);
}

/**
 * Cria um ReadableStream a partir de um Blob (para WebAV).
 */
export function blobToStream(blob: Blob): ReadableStream<Uint8Array> {
  if (blob.stream) {
    return blob.stream();
  }

  // Fallback para navegadores sem blob.stream()
  return new ReadableStream({
    async start(controller) {
      const arrayBuffer = await blob.arrayBuffer();
      controller.enqueue(new Uint8Array(arrayBuffer));
      controller.close();
    },
  });
}

/**
 * Limpa recursos de VideoFrame para prevenir memory leaks de GPU.
 */
export function closeVideoFrame(frame: VideoFrame | null | undefined): void {
  if (frame && typeof frame.close === 'function') {
    try {
      frame.close();
    } catch (error) {
      appLogger.warn('⚠️ Failed to close VideoFrame', { error });
    }
  }
}

/**
 * Formata microsegundos para string legível (MM:SS.mmm).
 */
export function formatMicroseconds(microseconds: Microseconds): string {
  const totalSeconds = Math.floor(microseconds / 1_000_000);
  const milliseconds = Math.floor((microseconds % 1_000_000) / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Estima tamanho do arquivo final baseado em configuração.
 */
export function estimateFileSize(
  durationMicroseconds: Microseconds,
  videoBitrate: number,
  audioBitrate: number,
): number {
  const durationSeconds = durationMicroseconds / 1_000_000;
  const videoBytes = (videoBitrate * durationSeconds) / 8;
  const audioBytes = (audioBitrate * durationSeconds) / 8;
  return Math.floor(videoBytes + audioBytes);
}
