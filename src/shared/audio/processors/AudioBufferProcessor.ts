import { resampleBuffer } from '@/shared/audio/utils/audioBuffer';

export class AudioBufferProcessor {
  constructor(private sampleRate = 44_100) {}

  async concatenateWithCrossfade(
    buffers: AudioBuffer[],
    crossfadeDuration = 0.05,
  ): Promise<AudioBuffer | null> {
    if (buffers.length === 0) {
      return null;
    }
    if (buffers.length === 1) {
      return resampleBuffer(buffers[0], this.sampleRate);
    }

    const normalizedBuffers = await Promise.all(
      buffers.map((buffer) => resampleBuffer(buffer, this.sampleRate)),
    );

    const crossfadeSamples = Math.max(
      1,
      Math.floor(crossfadeDuration * this.sampleRate),
    );
    const sanitizedBuffers = normalizedBuffers.map((buffer) =>
      ensureChannels(buffer, normalizedBuffers[0].numberOfChannels),
    );
    const totalLength = sanitizedBuffers.reduce((sum, buffer, index) => {
      if (index === 0) {
        return buffer.length;
      }
      return sum + Math.max(0, buffer.length - crossfadeSamples);
    }, 0);

    const numberOfChannels = sanitizedBuffers[0].numberOfChannels;
    const output = new AudioBuffer({
      length: totalLength,
      numberOfChannels,
      sampleRate: this.sampleRate,
    });

    this.copyBuffer(sanitizedBuffers[0], output, 0);
    let offset = sanitizedBuffers[0].length - crossfadeSamples;

    for (let index = 1; index < sanitizedBuffers.length; index += 1) {
      const current = sanitizedBuffers[index];
      this.applyCrossfadeRegion(output, current, offset, crossfadeSamples);
      this.copyBufferRegion(
        current,
        output,
        crossfadeSamples,
        current.length,
        offset + crossfadeSamples,
      );
      offset += current.length - crossfadeSamples;
    }

    removeDCOffset(output);
    preventClipping(output);

    return output;
  }

  private copyBuffer(src: AudioBuffer, dest: AudioBuffer, destOffset: number) {
    for (let channel = 0; channel < dest.numberOfChannels; channel += 1) {
      const srcChannel = Math.min(channel, src.numberOfChannels - 1);
      dest.getChannelData(channel).set(src.getChannelData(srcChannel), destOffset);
    }
  }

  private copyBufferRegion(
    src: AudioBuffer,
    dest: AudioBuffer,
    srcStart: number,
    srcEnd: number,
    destOffset: number,
  ) {
    for (let channel = 0; channel < dest.numberOfChannels; channel += 1) {
      const srcChannel = Math.min(channel, src.numberOfChannels - 1);
      const srcData = src.getChannelData(srcChannel);
      const destData = dest.getChannelData(channel);
      for (let index = srcStart; index < srcEnd; index += 1) {
        destData[destOffset + (index - srcStart)] = srcData[index];
      }
    }
  }

  private applyCrossfadeRegion(
    destBuffer: AudioBuffer,
    srcBuffer: AudioBuffer,
    destOffset: number,
    samples: number,
  ) {
    for (let channel = 0; channel < destBuffer.numberOfChannels; channel += 1) {
      const destData = destBuffer.getChannelData(channel);
      const srcChannel = Math.min(channel, srcBuffer.numberOfChannels - 1);
      const srcData = srcBuffer.getChannelData(srcChannel);
      for (let i = 0; i < samples; i += 1) {
        const t = i / Math.max(1, samples - 1);
        const fadeOut = Math.cos(t * 0.5 * Math.PI);
        const fadeIn = Math.cos((1 - t) * 0.5 * Math.PI);
        destData[destOffset + i] =
          destData[destOffset + i] * fadeOut + srcData[i] * fadeIn;
      }
    }
  }
}

export function removeDCOffset(buffer: AudioBuffer) {
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      sum += data[i];
    }
    const dc = sum / data.length;
    for (let i = 0; i < data.length; i += 1) {
      data[i] -= dc;
    }
  }
}

export function preventClipping(buffer: AudioBuffer, headroom = 0.05) {
  let max = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      const abs = Math.abs(data[i]);
      if (abs > max) {
        max = abs;
      }
    }
  }

  if (max > 1 - headroom) {
    const gain = (1 - headroom) / max;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) {
        data[i] *= gain;
      }
    }
  }
}

function ensureChannels(buffer: AudioBuffer, channels: number): AudioBuffer {
  if (buffer.numberOfChannels === channels) {
    return buffer;
  }

  const normalized = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: channels,
    sampleRate: buffer.sampleRate,
  });

  for (let channel = 0; channel < channels; channel += 1) {
    const srcChannel = Math.min(channel, buffer.numberOfChannels - 1);
    normalized.copyToChannel(buffer.getChannelData(srcChannel), channel);
  }

  return normalized;
}
