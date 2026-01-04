# Bibliotecas JavaScript para split/segmentação de áudio no browser

O ecossistema JavaScript oferece **15+ bibliotecas viáveis** para segmentação de áudio client-side, mas apenas 5-6 são realmente adequadas para um stack moderno React 19 + Vite 6 + TypeScript 5.8. A combinação ideal para o projeto EduScript AI é **Crunker para slicing simples, @ricky0123/vad-web para detecção de voz, e ffmpeg.wasm para operações complexas** — aproveitando as bibliotecas que você já utiliza (wavesurfer.js, RNNoise, FFmpeg.wasm, @ricky0123/vad-react).

> ✅ Para validar rapidamente o fluxo descrito aqui, use a rota `/audio-split`, que permite gravar um áudio, ajustar o slider limitado à duração e gerar os dois previews após o split.

## Panorama das soluções disponíveis em 2025

O mercado de áudio no browser evoluiu significativamente. As bibliotecas dividem-se em quatro categorias: **visualização com regiões** (wavesurfer.js, peaks.js), **processamento geral** (ffmpeg.wasm, Tone.js, Crunker), **detecção de atividade de voz** (@ricky0123/vad-web, RNNoise), e **utilidades de AudioBuffer** (audio-buffer-utils, waveform-data). Para split de áudio especificamente, a abordagem mais eficiente combina bibliotecas especializadas em vez de uma solução monolítica.

---

## Crunker: a escolha ideal para split por timestamps

**Crunker** destaca-se como a biblioteca mais eficiente para segmentação temporal pura. Com apenas **~2KB gzipped**, TypeScript nativo, e API intuitiva, integra-se perfeitamente com Vite sem configuração especial.

```typescript
import Crunker from 'crunker';

const crunker = new Crunker({ sampleRate: 48000 });

// Carregar áudio
const [buffer] = await crunker.fetchAudio('/audio.wav');

// Split por timestamps com fade opcional
const intro = crunker.sliceAudio(buffer, 0, 10, 0.1, 0.1);     // 0-10s com fade
const middle = crunker.sliceAudio(buffer, 10, 30);              // 10-30s
const outro = crunker.sliceAudio(buffer, 30, buffer.duration);  // 30s até fim

// Concatenar segmentos
const recombined = crunker.concatAudio([intro, middle]);

// Exportar WAV
const { blob, url } = crunker.export(intro, 'audio/wav');
crunker.download(blob, 'segment-intro');
```

| Característica | Valor |
|----------------|-------|
| **GitHub** | github.com/jaggad/crunker (~457 ⭐) |
| **Versão** | 2.4.1 (Janeiro 2024) |
| **Bundle** | ~2KB gzipped |
| **TypeScript** | ✅ Nativo |
| **Vite/ESM** | ✅ Zero config |
| **Export** | WAV apenas (MIME cosmético) |

**Prós**: Minúsculo, fade built-in, merge/concat, API simples
**Contras**: Export apenas WAV, sem detecção de silêncio

---

## wavesurfer.js Regions: split visual interativo

Para interfaces onde usuários selecionam visualmente regiões de áudio, **wavesurfer.js v7** oferece o Regions Plugin mais maduro do mercado. Você já usa esta biblioteca — basta adicionar extração programática dos segmentos.

```typescript
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

const regions = RegionsPlugin.create();
const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  url: '/audio.mp3',
  plugins: [regions]
});

// Criar região programaticamente
regions.addRegion({
  id: 'segment-1',
  start: 5.0,
  end: 15.0,
  color: 'rgba(0, 123, 255, 0.3)',
  drag: true,
  resize: true
});

// Extrair AudioBuffer da região
function extractRegion(region: Region): AudioBuffer {
  const audioBuffer = wavesurfer.getDecodedData()!;
  const { sampleRate, numberOfChannels } = audioBuffer;
  const startSample = Math.floor(region.start * sampleRate);
  const endSample = Math.floor(region.end * sampleRate);
  const length = endSample - startSample;
  
  const ctx = new AudioContext();
  const newBuffer = ctx.createBuffer(numberOfChannels, length, sampleRate);
  
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const temp = new Float32Array(length);
    audioBuffer.copyFromChannel(temp, ch, startSample);
    newBuffer.copyToChannel(temp, ch);
  }
  return newBuffer;
}
```

| Característica | Valor |
|----------------|-------|
| **GitHub** | github.com/katspaugh/wavesurfer.js (~10k ⭐) |
| **Versão** | 7.12.1 (Dezembro 2025) |
| **Bundle** | ~27KB min, ~9KB gzipped (core) |
| **TypeScript** | ✅ Nativo |
| **Regions Plugin** | ~5KB adicional |

**Prós**: UI rica, drag-select, eventos granulares, Shadow DOM isolation
**Contras**: Sem export built-in, memória alta para arquivos grandes

---

## @ricky0123/vad-web: split por detecção de voz

Para segmentar áudio baseado em **onde há fala**, a biblioteca **@ricky0123/vad-web** (que você já usa via vad-react) é a solução mais robusta. O modelo Silero VAD oferece **~87.7% true positive rate** a 5% false positive.

```typescript
import { NonRealTimeVAD } from '@ricky0123/vad-web';

// Processar arquivo offline para obter timestamps de fala
const vad = await NonRealTimeVAD.new({
  positiveSpeechThreshold: 0.5,
  negativeSpeechThreshold: 0.35,
  redemptionMs: 500,
  preSpeechPadMs: 100,
  minSpeechMs: 250
});

// audioData: Float32Array dos samples, sampleRate: taxa original
const speechSegments: Array<{audio: Float32Array; start: number; end: number}> = [];

for await (const segment of vad.run(audioData, 48000)) {
  speechSegments.push({
    audio: segment.audio,  // Float32Array @ 16kHz
    start: segment.start,  // milliseconds
    end: segment.end       // milliseconds
  });
  console.log(`Fala detectada: ${segment.start}ms - ${segment.end}ms`);
}

// Agora você tem array de segmentos com timestamps precisos
```

### Integração com React (já no seu stack)

```tsx
import { useMicVAD } from '@ricky0123/vad-react';

function AudioRecorder() {
  const segments = useRef<Float32Array[]>([]);
  
  const vad = useMicVAD({
    positiveSpeechThreshold: 0.3,
    onSpeechEnd: (audio) => {
      segments.current.push(audio);
      console.log(`Segmento capturado: ${audio.length / 16000}s`);
    }
  });

  return (
    <div>
      {vad.userSpeaking && <span>🎤 Falando...</span>}
      <p>Segmentos: {segments.current.length}</p>
    </div>
  );
}
```

| Característica | Valor |
|----------------|-------|
| **GitHub** | github.com/ricky0123/vad (~7.4k ⭐) |
| **Versão vad-web** | 0.0.29 |
| **Versão vad-react** | 0.0.35 |
| **Bundle** | ~4.4MB (inclui modelos ONNX) |
| **Runtime** | onnxruntime-web (~10MB WASM) |
| **TypeScript** | ✅ Nativo |

**Prós**: Precisão alta, real-time + offline, React hooks prontos
**Contras**: Bundle grande, carregamento inicial do modelo

---

## ffmpeg.wasm: silencedetect e conversão de formatos

Para **detecção de silêncio automática** e **export para MP3/WebM**, o ffmpeg.wasm que você já usa é imbatível. O filtro `silencedetect` identifica gaps automaticamente.

```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

// Configurar para Vite (CORS headers necessários)
await ffmpeg.load({
  coreURL: await toBlobURL('/ffmpeg-core.js', 'text/javascript'),
  wasmURL: await toBlobURL('/ffmpeg-core.wasm', 'application/wasm')
});

// Detectar silêncio e capturar timestamps
const silencePoints: number[] = [];

ffmpeg.on('log', ({ message }) => {
  // Parse output: "silence_end: 10.5 | silence_duration: 1.2"
  const match = message.match(/silence_end: ([\d.]+)/);
  if (match) silencePoints.push(parseFloat(match[1]));
});

await ffmpeg.writeFile('input.wav', await fetchFile(audioBlob));
await ffmpeg.exec([
  '-i', 'input.wav',
  '-af', 'silencedetect=n=-40dB:d=0.8',  // -40dB threshold, 0.8s min duration
  '-f', 'null', '-'
]);

console.log('Pontos de silêncio:', silencePoints);

// Split automático nos pontos detectados
await ffmpeg.exec([
  '-i', 'input.wav',
  '-f', 'segment',
  '-segment_times', silencePoints.join(','),
  '-reset_timestamps', '1',
  '-c:a', 'pcm_s16le',
  'segment_%03d.wav'
]);

// Ler segmentos gerados
const segment0 = await ffmpeg.readFile('segment_000.wav');
const blob = new Blob([segment0], { type: 'audio/wav' });
```

### Configuração Vite obrigatória

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  }
});
```

| Característica | Valor |
|----------------|-------|
| **GitHub** | github.com/ffmpegwasm/ffmpeg.wasm (~16.9k ⭐) |
| **Versão** | 0.12.15 (Janeiro 2025) |
| **Bundle WASM** | ~22MB (full), ~5MB (audio-only builds) |
| **TypeScript** | ✅ Nativo |
| **SharedArrayBuffer** | Necessário para multi-thread |

**Prós**: Poder total do FFmpeg, silencedetect, todos os codecs
**Contras**: WASM enorme, configuração CORS complexa, 2x mais lento que nativo

---

## Tone.js: manipulação avançada de buffers

**Tone.js** oferece o método `ToneAudioBuffer.slice()` nativo, ideal para manipulação programática quando você precisa de mais controle que Crunker oferece.

```typescript
import * as Tone from 'tone';

const buffer = new Tone.ToneAudioBuffer('/audio.mp3');
await Tone.loaded();

// Slice por tempo (segundos)
const sliced = buffer.slice(5, 15);  // 5s a 15s
console.log(`Duração do slice: ${sliced.duration}s`);

// Acessar AudioBuffer nativo
const audioBuffer = sliced.get();

// Player com loop points
const player = new Tone.Player(buffer).toDestination();
player.setLoopPoints(10, 20);  // Loop entre 10-20s
player.loop = true;
player.start();
```

| Característica | Valor |
|----------------|-------|
| **GitHub** | github.com/Tonejs/Tone.js (~14.6k ⭐) |
| **Versão** | 14.7.39 (stable), tone@next (dev) |
| **Bundle** | ~150KB min, ~45KB gzipped |
| **TypeScript** | ✅ 99.1% do código |

**Prós**: API elegante, slice nativo, integração Web Audio completa
**Contras**: Overkill se só precisa de slice, sem export built-in

---

## Export de segmentos: WAV, MP3, WebM

### WAV (sem dependências)

```typescript
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  
  const wav = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wav);
  
  // Header RIFF/WAVE
  const writeStr = (o: number, s: string) => 
    [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);  // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Samples
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([wav], { type: 'audio/wav' });
}
```

### MP3 com @breezystack/lamejs

```typescript
import * as lamejs from '@breezystack/lamejs';

function audioBufferToMp3(buffer: AudioBuffer, bitRate = 128): Blob {
  const mp3encoder = new lamejs.Mp3Encoder(1, buffer.sampleRate, bitRate);
  const mp3Data: Int8Array[] = [];
  
  const samples = buffer.getChannelData(0);
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  for (let i = 0; i < int16.length; i += 1152) {
    const chunk = int16.subarray(i, i + 1152);
    const buf = mp3encoder.encodeBuffer(chunk);
    if (buf.length > 0) mp3Data.push(buf);
  }
  
  const final = mp3encoder.flush();
  if (final.length > 0) mp3Data.push(final);
  
  return new Blob(mp3Data, { type: 'audio/mp3' });
}
```

### WebM/Opus via MediaRecorder

```typescript
async function audioBufferToWebM(buffer: AudioBuffer): Promise<Blob> {
  const ctx = new AudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  
  const dest = ctx.createMediaStreamDestination();
  source.connect(dest);
  
  const recorder = new MediaRecorder(dest.stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128000
  });
  
  const chunks: Blob[] = [];
  
  return new Promise((resolve) => {
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
    source.onended = () => recorder.stop();
    
    recorder.start();
    source.start();
  });
}
```

---

## Tabela comparativa completa

| Biblioteca | Stars | Bundle | TypeScript | Split temporal | Silence detect | VAD | Export | Vite |
|------------|-------|--------|------------|----------------|----------------|-----|--------|------|
| **Crunker** | 457 | 2KB | ✅ Nativo | ✅ `sliceAudio()` | ❌ | ❌ | WAV | ✅ |
| **wavesurfer.js** | 10k | 27KB | ✅ Nativo | ✅ Regions | ❌ | ❌ | Manual | ✅ |
| **peaks.js** | 3.4k | 130KB | ✅ Nativo | ✅ Segments | ❌ | ❌ | Manual | ✅ |
| **ffmpeg.wasm** | 16.9k | 22MB | ✅ Nativo | ✅ `-ss -to` | ✅ `silencedetect` | ❌ | Todos | ⚠️ |
| **Tone.js** | 14.6k | 45KB | ✅ Nativo | ✅ `slice()` | ❌ | ❌ | Manual | ✅ |
| **@ricky0123/vad-web** | 7.4k | 4.4MB | ✅ Nativo | Via timestamps | ❌ | ✅ Silero | ❌ | ✅ |
| **RNNoise WASM** | - | 100KB | ✅ | ❌ | ❌ | ⚠️ Básico | ❌ | ✅ |
| **audiobuffer-slice** | 96 | 2KB | ❌ | ✅ (ms) | ❌ | ❌ | ❌ | ✅ |
| **audio-buffer-utils** | 91 | 15KB | ⚠️ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **@breezystack/lamejs** | - | 400KB | ✅ | ❌ | ❌ | ❌ | MP3 | ✅ |

---

## Arquitetura recomendada para EduScript AI

Dado seu stack atual (React 19, Vite 6, TypeScript 5.8, 48kHz mono) e bibliotecas já em uso, recomendo esta arquitetura modular:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Audio Segmentation Pipeline              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────────┐    ┌───────────────┐   │
│  │ Input Audio │───▶│ Detection Layer │───▶│ Segmentation  │   │
│  │  (48kHz)    │    │                 │    │    Layer      │   │
│  └─────────────┘    │ • VAD (@ricky0123)   │               │   │
│                     │ • Silence (ffmpeg)│   │ • Crunker     │   │
│                     │ • Manual (wavesurfer) │ • Native slice│   │
│                     └─────────────────┘    └───────┬───────┘   │
│                                                    │           │
│                     ┌──────────────────────────────▼──────┐    │
│                     │          Export Layer               │    │
│                     │ • WAV: Native encoder               │    │
│                     │ • MP3: @breezystack/lamejs          │    │
│                     │ • WebM: MediaRecorder API           │    │
│                     │ • Any: ffmpeg.wasm (já disponível)  │    │
│                     └─────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Implementação sugerida

```typescript
// src/lib/audio-segmenter.ts
import Crunker from 'crunker';
import { NonRealTimeVAD } from '@ricky0123/vad-web';

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  buffer: AudioBuffer;
  type: 'speech' | 'silence' | 'manual';
}

export class AudioSegmenter {
  private crunker: Crunker;
  private vad: NonRealTimeVAD | null = null;
  
  constructor(private sampleRate = 48000) {
    this.crunker = new Crunker({ sampleRate });
  }
  
  // Split por timestamps manuais
  splitByTime(buffer: AudioBuffer, points: number[]): Segment[] {
    const segments: Segment[] = [];
    let start = 0;
    
    for (const end of [...points, buffer.duration]) {
      segments.push({
        id: crypto.randomUUID(),
        startTime: start,
        endTime: end,
        buffer: this.crunker.sliceAudio(buffer, start, end),
        type: 'manual'
      });
      start = end;
    }
    return segments;
  }
  
  // Split por VAD (detecção de voz)
  async splitByVAD(audioData: Float32Array): Promise<Segment[]> {
    if (!this.vad) {
      this.vad = await NonRealTimeVAD.new({
        positiveSpeechThreshold: 0.5,
        minSpeechMs: 300
      });
    }
    
    const segments: Segment[] = [];
    
    for await (const seg of this.vad.run(audioData, this.sampleRate)) {
      // Converter Float32Array 16kHz para AudioBuffer 48kHz
      const buffer = this.float32ToAudioBuffer(seg.audio, 16000);
      
      segments.push({
        id: crypto.randomUUID(),
        startTime: seg.start / 1000,
        endTime: seg.end / 1000,
        buffer,
        type: 'speech'
      });
    }
    return segments;
  }
  
  private float32ToAudioBuffer(data: Float32Array, rate: number): AudioBuffer {
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, data.length, rate);
    buffer.copyToChannel(data, 0);
    return buffer;
  }
}
```

### Prioridades de instalação

Se ainda não tem, adicione apenas o que falta:

```bash
# Já no projeto (manter)
# - wavesurfer.js, @ricky0123/vad-react, ffmpeg.wasm, crunker

# Adicionar para export MP3
npm install @breezystack/lamejs
```

## Conclusão

Para o contexto do EduScript AI, a estratégia mais eficiente é **combinar bibliotecas especializadas**: use **Crunker** para operações de slice simples (~2KB), **@ricky0123/vad-web** para segmentação inteligente por voz (já integrado), e **ffmpeg.wasm** para detecção de silêncio e conversão de formatos (já disponível). Evite adicionar peaks.js ou Tone.js — wavesurfer.js já cobre visualização, e as outras bibliotecas já cobrem processamento. O único pacote novo realmente necessário é **@breezystack/lamejs** se precisar exportar MP3 sem ffmpeg.wasm.