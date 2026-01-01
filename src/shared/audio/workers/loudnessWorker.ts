/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
const BLOCK_DURATION_SECONDS = 0.4;
const BLOCK_OVERLAP = 0.75;
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_OFFSET = 10;
const CHANNEL_WEIGHTS = [1.0, 1.0, 1.0, 1.41, 1.41];

const K_WEIGHTING_PARAMS = {
  highShelf: { gain: 4.0, Q: 1 / Math.sqrt(2), fc: 1_500, type: 'high_shelf' as const },
  highPass: { gain: 0, Q: 0.5, fc: 38, type: 'high_pass' as const },
};

type MeasureRequest = {
  id: number;
  type: 'measure';
  payload: {
    channels: ArrayBuffer[];
    sampleRate: number;
  };
};

type MeasureResponse = {
  id: number;
  type: 'measure:result';
  payload: LoudnessMetrics;
};

type LoudnessMetrics = {
  integratedLufs: number;
  blockValues: { time: number; value: number }[];
  truePeakDb: number;
  noiseFloorDb: number;
  loudnessRange: number;
};

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<MeasureRequest>) => {
  const message = event.data;
  if (!message || message.type !== 'measure') {
    return;
  }

  try {
    const channels = message.payload.channels.map(
      (buffer) => new Float32Array(buffer),
    );
    const metrics = measureLoudness(channels, message.payload.sampleRate);
    const response: MeasureResponse = {
      id: message.id,
      type: 'measure:result',
      payload: metrics,
    };
    workerScope.postMessage(response);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    workerScope.postMessage({
      id: message.id,
      type: 'measure:error',
      payload: errorMessage,
    });
  }
};

function measureLoudness(
  channels: Float32Array[],
  sampleRate: number,
): LoudnessMetrics {
  if (!channels.length) {
    return {
      integratedLufs: -Infinity,
      blockValues: [],
      truePeakDb: -Infinity,
      noiseFloorDb: -Infinity,
      loudnessRange: 0,
    };
  }

  const filtered = applyKWeighting(channels, sampleRate);
  const blockSize = Math.max(1, Math.round(sampleRate * BLOCK_DURATION_SECONDS));
  const hopSize = Math.max(1, Math.round(blockSize * (1 - BLOCK_OVERLAP)));
  const blocks = buildBlocks(filtered, sampleRate, blockSize, hopSize);

  const blocksAboveAbsolute = blocks.filter((block) => block.value > ABSOLUTE_GATE_LUFS);
  const preliminary = averageLoudness(blocksAboveAbsolute);
  const relativeThreshold = preliminary - RELATIVE_GATE_OFFSET;
  const gatedBlocks = blocksAboveAbsolute.filter((block) => block.value > relativeThreshold);
  const integratedLufs = averageLoudness(gatedBlocks);
  const loudnessRange = calculateLoudnessRange(gatedBlocks);

  const noiseFloorDb = estimateNoiseFloor(filtered, sampleRate);
  const truePeakDb = measureTruePeak(filtered, sampleRate);

  return {
    integratedLufs,
    blockValues: blocks,
    truePeakDb,
    noiseFloorDb,
    loudnessRange,
  };
}

function applyKWeighting(
  channels: Float32Array[],
  sampleRate: number,
): Float32Array[] {
  const shelfCoeffs = calculateBiquadCoeffs(K_WEIGHTING_PARAMS.highShelf, sampleRate);
  const highPassCoeffs = calculateBiquadCoeffs(K_WEIGHTING_PARAMS.highPass, sampleRate);

  return channels.map((channel) => {
    const shelf = applyBiquad(channel, shelfCoeffs);
    return applyBiquad(shelf, highPassCoeffs);
  });
}

type BlockValue = { time: number; value: number };

function buildBlocks(
  channels: Float32Array[],
  sampleRate: number,
  blockSize: number,
  hopSize: number,
): BlockValue[] {
  const frames = channels[0].length;
  const blocks: BlockValue[] = [];
  const weights = CHANNEL_WEIGHTS;
  const channelCount = channels.length;

  for (let start = 0; start + blockSize <= frames; start += hopSize) {
    let sum = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const weight = weights[channel] ?? 1.0;
      const meanSquare = calculateMeanSquare(channels[channel], start, blockSize);
      sum += weight * meanSquare;
    }
    const loudness = sum > 0 ? -0.691 + 10 * Math.log10(sum) : -Infinity;
    blocks.push({ time: start / sampleRate, value: loudness });
  }

  return blocks;
}

function calculateMeanSquare(
  data: Float32Array,
  start: number,
  length: number,
): number {
  let sum = 0;
  for (let i = start; i < start + length && i < data.length; i += 1) {
    const sample = data[i];
    sum += sample * sample;
  }
  return sum / length;
}

function averageLoudness(blocks: BlockValue[]): number {
  if (!blocks.length) {
    return -Infinity;
  }
  const sum = blocks.reduce((acc, block) => acc + Math.pow(10, block.value / 10), 0);
  return 10 * Math.log10(sum / blocks.length);
}

function calculateLoudnessRange(blocks: BlockValue[]): number {
  if (blocks.length < 2) {
    return 0;
  }
  const values = blocks.map((block) => block.value).sort((a, b) => a - b);
  const lower = percentile(values, 0.1);
  const upper = percentile(values, 0.95);
  return upper - lower;
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.max(0, Math.round(fraction * (values.length - 1))));
  return values[index];
}

function estimateNoiseFloor(
  channels: Float32Array[],
  sampleRate: number,
): number {
  const windowSize = Math.min(channels[0].length, Math.round(sampleRate * 0.5));
  let sumSquares = 0;
  let count = 0;

  for (const channel of channels) {
    for (let i = 0; i < windowSize; i += 1) {
      const sample = channel[i];
      sumSquares += sample * sample;
      count += 1;
    }
  }

  const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
  return 20 * Math.log10(rms || 1e-12);
}

function measureTruePeak(
  channels: Float32Array[],
  sampleRate: number,
): number {
  const oversampleFactor = Math.min(4, Math.max(1, Math.ceil(192_000 / sampleRate)));
  let maxAbs = 0;

  for (const channel of channels) {
    for (let i = 0; i < channel.length - 1; i += 1) {
      const current = channel[i];
      const next = channel[i + 1];
      for (let k = 0; k < oversampleFactor; k += 1) {
        const t = k / oversampleFactor;
        const sample = current + (next - current) * t;
        const abs = Math.abs(sample);
        if (abs > maxAbs) {
          maxAbs = abs;
        }
      }
    }
  }

  return 20 * Math.log10(maxAbs || 1e-12);
}

type BiquadCoeffs = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

type FilterParams = {
  gain: number;
  Q: number;
  fc: number;
  type: 'high_shelf' | 'high_pass';
};

function calculateBiquadCoeffs(
  filter: FilterParams,
  sampleRate: number,
): BiquadCoeffs {
  const { gain, Q, fc, type } = filter;
  const A = Math.pow(10, gain / 40);
  const omega = (2 * Math.PI * fc) / sampleRate;
  const cos = Math.cos(omega);
  const sin = Math.sin(omega);
  const alpha = sin / (2 * Q);

  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = 0;
  let a2 = 0;

  if (type === 'high_shelf') {
    const sqrtA = Math.sqrt(A);
    b0 = A * ((A + 1) + (A - 1) * cos + 2 * sqrtA * alpha);
    b1 = -2 * A * ((A - 1) + (A + 1) * cos);
    b2 = A * ((A + 1) + (A - 1) * cos - 2 * sqrtA * alpha);
    a0 = (A + 1) - (A - 1) * cos + 2 * sqrtA * alpha;
    a1 = 2 * ((A - 1) - (A + 1) * cos);
    a2 = (A + 1) - (A - 1) * cos - 2 * sqrtA * alpha;
  } else {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function applyBiquad(data: Float32Array, coeffs: BiquadCoeffs): Float32Array {
  const output = new Float32Array(data.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < data.length; i += 1) {
    const x0 = data[i];
    const y0 = coeffs.b0 * x0 + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
}

export {};
