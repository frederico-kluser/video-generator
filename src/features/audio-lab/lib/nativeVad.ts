export type NativeVadOptions = {
  analyser: AnalyserNode;
  silenceThresholdMs: number;
  minActiveMs?: number;
  onSilence?: () => void;
  onUpdate?: (state: NativeVadState) => void;
};

export type NativeVadState = {
  isSpeech: boolean;
  silenceMs: number;
  voiceEnergy: number;
  noiseEnergy: number;
};

const VOICE_BAND: [number, number] = [80, 3000];
const NOISE_BAND: [number, number] = [4000, 8000];

export class NativeVad {
  private readonly analyser: AnalyserNode;
  private readonly silenceThresholdMs: number;
  private readonly minActiveMs: number;
  private readonly onSilence?: () => void;
  private readonly onUpdate?: (state: NativeVadState) => void;
  private readonly fftData: Uint8Array;
  private rafId?: number;
  private lastTimestamp = 0;
  private silenceAccumulator = 0;
  private hasDetectedSpeech = false;
  private firstSpeechTimestamp = 0;
  private running = false;

  constructor({ analyser, silenceThresholdMs, minActiveMs = 1500, onSilence, onUpdate }: NativeVadOptions) {
    this.analyser = analyser;
    this.silenceThresholdMs = silenceThresholdMs;
    this.minActiveMs = minActiveMs;
    this.onSilence = onSilence;
    this.onUpdate = onUpdate;
    this.fftData = new Uint8Array(analyser.frequencyBinCount);
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.fftSize = Math.max(this.analyser.fftSize, 2048);
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
  }

  reset() {
    this.silenceAccumulator = 0;
    this.hasDetectedSpeech = false;
    this.firstSpeechTimestamp = 0;
  }

  private loop = (timestamp: number) => {
    if (!this.running) {
      return;
    }

    const delta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    const { isSpeech, voiceEnergy, noiseEnergy } = this.detectSpeech();

    if (isSpeech) {
      this.silenceAccumulator = 0;
      if (!this.hasDetectedSpeech) {
        this.hasDetectedSpeech = true;
        this.firstSpeechTimestamp = timestamp;
      }
    } else if (this.hasDetectedSpeech) {
      this.silenceAccumulator += delta;
    }

    this.onUpdate?.({
      isSpeech,
      silenceMs: this.silenceAccumulator,
      voiceEnergy,
      noiseEnergy,
    });

    if (
      this.hasDetectedSpeech &&
      this.silenceAccumulator >= this.silenceThresholdMs &&
      timestamp - this.firstSpeechTimestamp >= this.minActiveMs
    ) {
      this.onSilence?.();
      this.reset();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private detectSpeech() {
    this.analyser.getByteFrequencyData(this.fftData);
    const binSize = this.analyser.context.sampleRate / this.analyser.fftSize;

    const voiceEnergy = this.getBandEnergy(VOICE_BAND, binSize);
    const noiseEnergy = this.getBandEnergy(NOISE_BAND, binSize);

    const voiceDb = 20 * Math.log10(voiceEnergy + 1e-6);
    const ratio = (voiceEnergy + 1e-3) / (noiseEnergy + 1e-3);

    const isSpeech = voiceDb > -42 && ratio > 2.8;
    return { isSpeech, voiceEnergy, noiseEnergy };
  }

  private getBandEnergy([minHz, maxHz]: [number, number], binSize: number) {
    const minBin = Math.max(0, Math.floor(minHz / binSize));
    const maxBin = Math.min(this.fftData.length - 1, Math.ceil(maxHz / binSize));

    let sum = 0;
    for (let i = minBin; i <= maxBin; i += 1) {
      const value = this.fftData[i] / 255; // normalize 0-1
      sum += value * value;
    }

    return Math.sqrt(sum / Math.max(1, maxBin - minBin + 1));
  }
}
