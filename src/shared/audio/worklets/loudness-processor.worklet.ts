/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
class LoudnessProcessor extends AudioWorkletProcessor {
  private buffer: number[] = [];
  private readonly blockSize = Math.max(128, Math.round(0.4 * sampleRate));
  private readonly hopSize = Math.max(32, Math.round(this.blockSize * 0.25));

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i += 1) {
      this.buffer.push(channelData[i]);
    }

    if (this.buffer.length >= this.blockSize) {
      const block = this.buffer.slice(0, this.blockSize);
      this.buffer = this.buffer.slice(this.hopSize);
      const momentary = this.calculateMomentaryLufs(block);
      if (Number.isFinite(momentary)) {
        this.port.postMessage({ type: 'momentary', value: momentary });
      }
    }

    return true;
  }

  private calculateMomentaryLufs(samples: number[]): number {
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      sumSquares += sample * sample;
    }
    const meanSquare = sumSquares / Math.max(1, samples.length);
    return -0.691 + 10 * Math.log10(meanSquare || 1e-12);
  }
}

registerProcessor('loudness-processor', LoudnessProcessor);

export {};
