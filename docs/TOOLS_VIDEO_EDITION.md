# Ferramentas para Geração de Vídeo Educacional em React 19

A combinação de **RNNoise WASM**, **WebCodecs API**, e **FFmpeg.wasm** oferece o melhor ecossistema para processamento de áudio e vídeo client-side em 2025. Este guia apresenta as ferramentas mais relevantes para um projeto React 19 + TypeScript + Vite que utiliza MediaRecorder e canvas.captureStream().

---

## Processamento de áudio no browser

O **Web Audio API** nativo continua sendo a base para qualquer processamento de áudio, mas bibliotecas especializadas simplificam casos de uso complexos.

### Tone.js — Framework completo para áudio interativo

Escrito em TypeScript com **14.6k stars** no GitHub, Tone.js oferece DAW-like features incluindo compressores, limiters, e crossfades. Ideal para efeitos em tempo real e síntese de áudio.

```bash
npm install tone
```

```typescript
import { useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';

function useAudioDynamics() {
  const compressorRef = useRef<Tone.Compressor | null>(null);
  const limiterRef = useRef<Tone.Limiter | null>(null);

  const initDynamics = useCallback(async () => {
    await Tone.start();

    const compressor = new Tone.Compressor({
      threshold: -24,
      ratio: 4,
      attack: 0.005,
      release: 0.1,
      knee: 6,
    });

    const limiter = new Tone.Limiter(-1);
    compressor.connect(limiter);
    limiter.toDestination();

    compressorRef.current = compressor;
    limiterRef.current = limiter;
    return compressor;
  }, []);

  return { initDynamics };
}
```

**Casos de uso:** Background music, sound effects, dynamic compression para voice recordings.  
**Limitação:** Bundle ~5.4MB (tree-shakeable), requer user interaction para AudioContext.

### wavesurfer.js — Visualização de waveforms

Com **10k stars** e TypeScript nativo, wavesurfer.js v7 oferece plugins para recording, spectrogram e timeline.

```bash
npm install wavesurfer.js @wavesurfer/react
```

```typescript
import { useWavesurfer } from '@wavesurfer/react';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

const { wavesurfer, isReady } = useWavesurfer({
  container: containerRef,
  waveColor: '#4F4A85',
  progressColor: '#383351',
  plugins: [RecordPlugin.create()],
});
```

**Casos de uso:** Timeline de áudio para slides, visualização de gravações, audio editing interface.  
**Limitação:** Arquivos grandes requerem pre-computed peaks para performance.

### FFmpeg.wasm para áudio — Conversão e normalização

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

```typescript
// vite.config.ts - Headers obrigatórios
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
```

```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const normalizeAudio = async (inputBlob: Blob): Promise<Blob> => {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();

  await ffmpeg.writeFile('input.wav', await fetchFile(inputBlob));
  await ffmpeg.exec([
    '-i',
    'input.wav',
    '-af',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
    'output.wav',
  ]);

  const data = await ffmpeg.readFile('output.wav');
  return new Blob([data], { type: 'audio/wav' });
};
```

**Casos de uso:** Conversão WebM→MP3, loudness normalization EBU R128, trim/concat.  
**Limitação:** ~25MB download, requer SharedArrayBuffer (COOP/COEP headers), Safari limitado.

---

## Melhoria de qualidade de áudio com IA

### RNNoise WASM — Remoção de ruído com redes neurais

O **@timephy/rnnoise-wasm** é a melhor opção para Vite, com TypeScript completo e AudioWorklet integrado.

```bash
npm install @timephy/rnnoise-wasm
```

```typescript
import { NoiseSuppressorWorklet_Name } from '@timephy/rnnoise-wasm';
import NoiseSuppressorWorklet from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url';

export function useNoiseSuppression() {
  const initNoiseSuppression = async (stream: MediaStream) => {
    const ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.audioWorklet.addModule(NoiseSuppressorWorklet);

    const noiseSuppressionNode = new AudioWorkletNode(
      ctx,
      NoiseSuppressorWorklet_Name,
    );
    const source = ctx.createMediaStreamSource(stream);
    const destination = ctx.createMediaStreamDestination();

    source.connect(noiseSuppressionNode).connect(destination);
    return destination.stream;
  };

  return { initNoiseSuppression };
}
```

**Alternativa:** `@shiguredo/noise-suppression` oferece API mais simples com MediaStreamTrack.  
**Limitação:** Requer 48kHz sample rate, mono only, ~5ms latency.

### Voice Activity Detection — Silero VAD via ONNX

O **@ricky0123/vad-react** detecta automaticamente quando há fala, útil para segmentação de slides.

```bash
npm install @ricky0123/vad-react onnxruntime-web
```

```typescript
import { useMicVAD } from "@ricky0123/vad-react";

function VoiceRecorder() {
  const vad = useMicVAD({
    positiveSpeechThreshold: 0.8,
    negativeSpeechThreshold: 0.3,
    redemptionFrames: 10,
    onSpeechStart: () => console.log("Gravando..."),
    onSpeechEnd: (audio: Float32Array) => {
      // audio é 16kHz Float32Array
      processAudioSegment(audio);
    },
  });

  return <>{vad.userSpeaking && <span>🔴 Gravando</span>}</>;
}
```

**Vite config adicional:**

```typescript
import { viteStaticCopy } from 'vite-plugin-static-copy';

plugins: [
  viteStaticCopy({
    targets: [
      {
        src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
        dest: './',
      },
      {
        src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx',
        dest: './',
      },
      { src: 'node_modules/onnxruntime-web/dist/*.wasm', dest: './' },
    ],
  }),
];
```

### Loudness Normalization — EBU R128

O **ebur128-wasm** implementa ITU-R BS.1770 para medição precisa de loudness.

```bash
npm install ebur128-wasm
```

```typescript
import { EbuR128 } from 'ebur128-wasm';

const measureLoudness = async (audioBuffer: AudioBuffer) => {
  const ebur128 = new EbuR128(
    audioBuffer.sampleRate,
    audioBuffer.numberOfChannels,
  );

  const channels: Float32Array[] = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  ebur128.addFramesPlanar(channels);

  return {
    loudness: ebur128.loudnessGlobal(), // LUFS
    truePeak: ebur128.samplePeak(0), // dBTP
    loudnessRange: ebur128.loudnessRange(), // LRA
  };
};

// Normalização para target LUFS
const normalizeToTarget = (
  buffer: AudioBuffer,
  currentLUFS: number,
  targetLUFS = -16,
) => {
  const gainDB = targetLUFS - currentLUFS;
  const gainLinear = Math.pow(10, gainDB / 20);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gainLinear;
    }
  }
  return buffer;
};
```

**Target recomendado:** -16 LUFS para YouTube/podcasts, -23 LUFS para broadcast.

---

## Renderização e encoding de vídeo

### WebCodecs API — Encoding de alta performance

A WebCodecs API oferece controle frame-by-frame com aceleração de hardware, suportada em **94% dos browsers** (Chrome 94+, Firefox 130+, Safari 16.4+).

```bash
npm install -D @types/dom-webcodecs
npm install mp4-muxer webm-muxer
```

```typescript
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

interface WebCodecsRecorderOptions {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
}

export function useWebCodecsRecorder(options: WebCodecsRecorderOptions) {
  const encoderRef = useRef<VideoEncoder | null>(null);
  const muxerRef = useRef<Muxer<ArrayBufferTarget> | null>(null);
  const frameCountRef = useRef(0);

  const initialize = async () => {
    // Check codec support
    const support = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42001E', // H.264 Baseline
      width: options.width,
      height: options.height,
      bitrate: options.bitrate,
      framerate: options.frameRate,
    });

    if (!support.supported) throw new Error('Codec not supported');

    muxerRef.current = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: options.width, height: options.height },
      fastStart: 'in-memory',
    });

    encoderRef.current = new VideoEncoder({
      output: (chunk, meta) => muxerRef.current?.addVideoChunk(chunk, meta),
      error: (e) => console.error('Encoder error:', e),
    });

    encoderRef.current.configure({
      codec: 'avc1.42001E',
      width: options.width,
      height: options.height,
      bitrate: options.bitrate,
      framerate: options.frameRate,
      latencyMode: 'quality',
      hardwareAcceleration: 'prefer-hardware',
    });
  };

  const encodeFrame = (canvas: HTMLCanvasElement, timestampMs: number) => {
    if (!encoderRef.current || encoderRef.current.state !== 'configured')
      return;

    const frame = new VideoFrame(canvas, {
      timestamp: timestampMs * 1000, // microseconds
      duration: (1000 / options.frameRate) * 1000,
    });

    const keyFrame = frameCountRef.current % 60 === 0;

    if (encoderRef.current.encodeQueueSize <= 5) {
      encoderRef.current.encode(frame, { keyFrame });
    }
    frame.close();
    frameCountRef.current++;
  };

  const finalize = async (): Promise<Blob> => {
    await encoderRef.current?.flush();
    encoderRef.current?.close();
    muxerRef.current?.finalize();

    const { buffer } = muxerRef.current!.target;
    return new Blob([buffer], { type: 'video/mp4' });
  };

  return { initialize, encodeFrame, finalize };
}
```

**Vantagens sobre MediaRecorder:** Controle de timestamps em microsegundos, encoding não-realtime, hardware acceleration direto.

### MediaRecorder otimizado

Para casos mais simples, MediaRecorder com configurações otimizadas:

```typescript
const getSupportedMimeType = () => {
  const types = [
    'video/webm;codecs=vp9', // Best quality WebM
    'video/webm;codecs=vp8', // Firefox fallback
    'video/mp4', // Safari, Chrome 123+
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
};

const createRecorder = (stream: MediaStream) => {
  return new MediaRecorder(stream, {
    mimeType: getSupportedMimeType(),
    videoBitsPerSecond: 5_000_000, // 5 Mbps for 1080p
    audioBitsPerSecond: 128_000, // 128 kbps
  });
};
```

### Comparativo de codecs

| Codec     | Suporte                       | Tamanho Relativo | Velocidade Encoding |
| --------- | ----------------------------- | ---------------- | ------------------- |
| H.264/AVC | Universal                     | 100% (baseline)  | Rápido (HW)         |
| VP9       | Chrome, Firefox, Safari 14+   | 50-70%           | Médio               |
| AV1       | Chrome, Firefox, Safari 16.4+ | 30-50%           | Lento               |

**Recomendação:** VP9 para qualidade/tamanho, H.264 para máxima compatibilidade.

---

## Ferramentas complementares

### Crunker — Concatenação de áudio

```bash
npm install crunker
```

```typescript
import Crunker from 'crunker';

const concatenateSlideAudios = async (audioUrls: string[]) => {
  const crunker = new Crunker({ sampleRate: 48000 });
  const buffers = await crunker.fetchAudio(...audioUrls);
  const concatenated = await crunker.concatAudio(buffers);
  return await crunker.export(concatenated, 'audio/wav');
};
```

### audiobuffer-to-wav — Exportação WAV

```bash
npm install audiobuffer-to-wav @types/audiobuffer-to-wav
```

```typescript
import toWav from 'audiobuffer-to-wav';

const exportToWav = (audioBuffer: AudioBuffer): Blob => {
  const wavData = toWav(audioBuffer);
  return new Blob([wavData], { type: 'audio/wav' });
};
```

### Detector de clipping

```typescript
function useClippingDetector() {
  const detectClipping = (analyser: AnalyserNode) => {
    const dataArray = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(dataArray);

    let peak = 0;
    for (const sample of dataArray) {
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }

    const peakDb = 20 * Math.log10(Math.max(peak, 0.0001));
    const isClipping = peak >= 0.99;

    return { peak, peakDb, isClipping };
  };

  return { detectClipping };
}
```

### extendable-media-recorder — WAV recording cross-browser

```bash
npm install extendable-media-recorder extendable-media-recorder-wav-encoder
```

```typescript
import { MediaRecorder, register } from 'extendable-media-recorder';
import { connect } from 'extendable-media-recorder-wav-encoder';

await register(await connect());

const recorder = new MediaRecorder(stream, { mimeType: 'audio/wav' });
```

---

## Normalização de volume entre gravações

O problema mais comum em vídeos educacionais com múltiplas gravações é a inconsistência de volume. A solução recomendada combina **processamento em tempo real** durante gravação com **pós-processamento** antes do export.

### Cadeia de processamento recomendada

```
Microfone → getUserMedia (echoCancellation, autoGainControl, noiseSuppression)
    ↓
RNNoise WASM (AI noise suppression)
    ↓
High-pass Filter (80Hz, remove rumble)
    ↓
Compressor (threshold: -24dB, ratio: 4:1)
    ↓
Limiter (ceiling: -1dB)
    ↓
MediaRecorder → WebM/WAV
    ↓
Pós-processamento: Silence trimming, Loudness normalization (-16 LUFS)
```

### Implementação completa

```typescript
export function useAudioRecordingPipeline() {
  const startRecording = async () => {
    // 1. getUserMedia com constraints otimizados para voz
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 48000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const ctx = new AudioContext({ sampleRate: 48000 });
    const source = ctx.createMediaStreamSource(stream);

    // 2. High-pass filter (remove rumble)
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;

    // 3. Compressor para voz
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    // 4. Limiter
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;

    const destination = ctx.createMediaStreamDestination();

    source
      .connect(highpass)
      .connect(compressor)
      .connect(limiter)
      .connect(destination);

    // 5. Gravar stream processada
    const recorder = new MediaRecorder(destination.stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    return { recorder, cleanup: () => ctx.close() };
  };

  return { startRecording };
}
```

### Normalização pós-gravação

```typescript
const normalizeAllSlideAudios = async (audioBuffers: AudioBuffer[]) => {
  const targetLUFS = -16;

  // 1. Medir loudness de cada buffer
  const measurements = await Promise.all(
    audioBuffers.map((buffer) => measureLoudness(buffer)),
  );

  // 2. Normalizar cada buffer para o target
  const normalizedBuffers = audioBuffers.map((buffer, i) => {
    const gainDB = targetLUFS - measurements[i].loudness;
    const gainLinear = Math.pow(10, gainDB / 20);

    // Aplicar gain com limiting para evitar clipping
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let j = 0; j < data.length; j++) {
        data[j] = Math.max(-1, Math.min(1, data[j] * gainLinear));
      }
    }
    return buffer;
  });

  return normalizedBuffers;
};
```

---

## Tabela resumo de ferramentas

| Categoria             | Ferramenta                | NPM                         | TypeScript | Browser               |
| --------------------- | ------------------------- | --------------------------- | ---------- | --------------------- |
| **Audio Framework**   | Tone.js                   | `tone`                      | ✅ Nativo  | Universal             |
| **Waveform**          | wavesurfer.js             | `wavesurfer.js`             | ✅ Nativo  | Universal             |
| **Noise Reduction**   | @timephy/rnnoise-wasm     | `@timephy/rnnoise-wasm`     | ✅ Nativo  | Universal             |
| **VAD**               | @ricky0123/vad-react      | `@ricky0123/vad-react`      | ✅ Nativo  | Universal             |
| **Loudness**          | ebur128-wasm              | `ebur128-wasm`              | ✅ Nativo  | Universal             |
| **Concatenation**     | Crunker                   | `crunker`                   | ✅ Nativo  | Universal             |
| **WAV Export**        | audiobuffer-to-wav        | `audiobuffer-to-wav`        | Via @types | Universal             |
| **MP3 Encoding**      | lamejs                    | `@breezystack/lamejs`       | ⚠️ Fork    | Universal             |
| **Video Muxing**      | mp4-muxer                 | `mp4-muxer`                 | ✅ Nativo  | Chrome 94+            |
| **Format Conversion** | FFmpeg.wasm               | `@ffmpeg/ffmpeg`            | ✅ Nativo  | Chrome, Firefox, Edge |
| **WAV Recording**     | extendable-media-recorder | `extendable-media-recorder` | ✅ Nativo  | Universal             |

---

## Arquitetura sugerida para o projeto

```
src/features/video-generation/
├── hooks/
│   ├── useAudioRecording.ts      # MediaRecorder + processing chain
│   ├── useNoiseSuppression.ts    # RNNoise integration
│   ├── useLoudnessNormalization.ts # EBU R128
│   ├── useWebCodecsEncoder.ts    # Video encoding
│   └── useAudioVisualization.ts  # wavesurfer/audiomotion
├── processors/
│   ├── audio-worklet-processor.ts # Custom AudioWorklet
│   └── ffmpeg-processor.ts       # FFmpeg.wasm wrapper
├── utils/
│   ├── codec-support.ts          # Feature detection
│   └── audio-buffer-utils.ts     # Buffer manipulation
└── components/
    ├── WaveformDisplay.tsx
    ├── RecordingQualityIndicator.tsx
    └── VolumeNormalizer.tsx
```

A combinação de **RNNoise para noise reduction em tempo real**, **DynamicsCompressorNode para consistência de volume durante gravação**, e **ebur128-wasm para normalização LUFS pós-gravação** oferece qualidade profissional de áudio inteiramente client-side, compatível com o stack React 19 + TypeScript + Vite especificado.
