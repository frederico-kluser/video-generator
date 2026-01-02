import { type LoudnessMetrics } from '@/shared/audio/hooks/useLoudnessWorker';
import { cloneAudioBuffer } from '@/shared/audio/utils/audioBuffer';

export const PLATFORM_TARGETS = {
  spotify: {
    label: 'Spotify',
    description: '-14 LUFS / -1 dBTP',
    lufs: -14,
    truePeak: -1,
  },
  apple_music: {
    label: 'Apple Music',
    description: '-16 LUFS / -1 dBTP',
    lufs: -16,
    truePeak: -1,
  },
  youtube: {
    label: 'YouTube',
    description: '-14 LUFS / -1 dBTP',
    lufs: -14,
    truePeak: -1,
  },
  broadcast_ebu: {
    label: 'EBU R128',
    description: '-23 LUFS / -1 dBTP',
    lufs: -23,
    truePeak: -1,
  },
  podcast: {
    label: 'Podcast / Narrativa',
    description: '-16 LUFS / -1 dBTP',
    lufs: -16,
    truePeak: -1,
  },
} as const;

export type PlatformTargetKey = keyof typeof PLATFORM_TARGETS;
export type PlatformTarget = (typeof PLATFORM_TARGETS)[PlatformTargetKey];

export async function normalizeToTarget(
  buffer: AudioBuffer,
  target: PlatformTarget,
  measureBuffer: (buffer: AudioBuffer) => Promise<LoudnessMetrics>,
): Promise<{ buffer: AudioBuffer; appliedGainDb: number; metrics: LoudnessMetrics }> {
  const metrics = await measureBuffer(buffer);
  const desiredGainDb = target.lufs - metrics.integratedLufs;
  const peakHeadroom = target.truePeak - metrics.truePeakDb;
  const safeGainDb = Math.min(desiredGainDb, peakHeadroom);

  if (!Number.isFinite(safeGainDb) || safeGainDb === 0) {
    return { buffer, appliedGainDb: 0, metrics };
  }

  const adjusted = applyGain(cloneAudioBuffer(buffer), safeGainDb);
  const updatedMetrics = await measureBuffer(adjusted);
  return { buffer: adjusted, appliedGainDb: safeGainDb, metrics: updatedMetrics };
}

export function applyGain(buffer: AudioBuffer, gainDb: number): AudioBuffer {
  const gain = Math.pow(10, gainDb / 20);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      data[i] *= gain;
    }
  }
  return buffer;
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
