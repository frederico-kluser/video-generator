import { appLogger } from '@/shared/logging/logger';

const DEFAULT_RESAMPLE_TIMEOUT_MS = 30_000;

export function cloneAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const clone = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    clone.copyToChannel(buffer.getChannelData(channel), channel);
  }

  return clone;
}

export function convertToMono(buffer: AudioBuffer): AudioBuffer {
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
      const sample = Number.isFinite(rawSample) ? rawSample : 0;
      output[i] += sample / buffer.numberOfChannels;
    }
  }

  return monoBuffer;
}

export async function resampleBuffer(
  buffer: AudioBuffer,
  targetSampleRate: number,
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate) {
    return buffer;
  }

  const OfflineAudioContextCtor = getOfflineAudioContextCtor();
  if (!OfflineAudioContextCtor) {
    appLogger.warn('OfflineAudioContext indisponível; mantendo sample rate original.');
    return buffer;
  }

  const frameCount = Math.ceil(buffer.duration * targetSampleRate);
  const offline = new OfflineAudioContextCtor(
    buffer.numberOfChannels,
    frameCount,
    targetSampleRate,
  );

  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);

  return renderOfflineWithTimeout(offline, 'resample');
}

export async function renderOfflineWithTimeout(
  offlineCtx: OfflineAudioContext,
  stageName: string,
  timeoutMs = DEFAULT_RESAMPLE_TIMEOUT_MS,
): Promise<AudioBuffer> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${stageName} excedeu ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([offlineCtx.startRendering(), timeoutPromise]);
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

export function audioBufferToWaveBlob(
  buffer: AudioBuffer,
  options: { bitDepth?: 16 | 24 | 32 } = {},
): Blob {
  const bitDepth = options.bitDepth ?? 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = buffer.numberOfChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true);
  view.setUint16(22, buffer.numberOfChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;

  if (bitDepth === 32) {
    for (let i = 0; i < buffer.length; i += 1) {
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const sample = buffer.getChannelData(channel)[i] ?? 0;
        view.setFloat32(offset, sample, true);
        offset += 4;
      }
    }
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const rawSample = buffer.getChannelData(channel)[i];
      const sample = Number.isFinite(rawSample) ? rawSample : 0;
      const clamped = Math.max(-1, Math.min(1, sample));

      if (bitDepth === 24) {
        const integer = clamped < 0 ? clamped * 0x800000 : clamped * 0x7fffff;
        view.setUint8(offset, integer & 0xff);
        view.setUint8(offset + 1, (integer >> 8) & 0xff);
        view.setUint8(offset + 2, (integer >> 16) & 0xff);
        offset += 3;
      } else {
        view.setInt16(
          offset,
          clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
          true,
        );
        offset += 2;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export async function decodeBlobToAudioBuffer(
  blob: Blob,
  options: { sampleRate?: number } = {},
): Promise<AudioBuffer> {
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) {
    throw new Error('AudioContext indisponível neste ambiente.');
  }

  const context = new AudioContextCtor({ sampleRate: options.sampleRate });
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await context.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function concatenateBuffers(
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
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      output.getChannelData(channel).set(buffer.getChannelData(channel), offset);
    }
    offset += buffer.length;
  }

  return output;
}

type WebkitAudioWindow = Window & {
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
  webkitAudioContext?: typeof AudioContext;
};

function getOfflineAudioContextCtor(): typeof OfflineAudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (
    window.OfflineAudioContext ||
    (window as WebkitAudioWindow).webkitOfflineAudioContext ||
    null
  );
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext || null;
}

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
