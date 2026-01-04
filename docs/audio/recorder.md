# Gravação de áudio na web com qualidade máxima: guia completo 2024-2025

A **extendable-media-recorder** combinada com **AudioWorklet** e processamento em tempo real via Web Audio API oferece a melhor solução para gravação de narração de alta qualidade em React/TypeScript. Esta configuração permite gravar em WAV lossless a 48kHz/16-bit com pré-processamento completo, mantendo compatibilidade cross-browser incluindo Safari 18.4+.

## Ranking das melhores bibliotecas para gravação

Para o projeto EduScript AI com foco em narração educacional, a stack recomendada combina múltiplas bibliotecas especializadas:

| Posição | Biblioteca | Score | Ideal Para | Downloads/Semana |
|---------|-----------|-------|------------|------------------|
| 1 | extendable-media-recorder | ⭐⭐⭐⭐⭐ | Gravação principal WAV/Opus | ~106.000 |
| 2 | @ricky0123/vad-react | ⭐⭐⭐⭐⭐ | Detecção de voz (VAD) | ~168.000 |
| 3 | wavesurfer.js v7 | ⭐⭐⭐⭐ | Visualização + gravação | ~350.000 |
| 4 | opus-media-recorder | ⭐⭐⭐⭐ | Opus cross-browser via WASM | ~25.000 |
| 5 | @sapphi-red/web-noise-suppressor | ⭐⭐⭐⭐ | Noise suppression alternativo | ~2.000 |
| 6 | libflac.js | ⭐⭐⭐ | Gravação FLAC lossless | npm: libflacjs |
| 7 | RecordRTC | ⭐⭐⭐ | Legacy (não recomendado) | ~142.000 |

A **extendable-media-recorder** destaca-se por ser escrita nativamente em TypeScript, usar AudioWorklet moderno, ter bundle pequeno (~15KB), e ser ativamente mantida com updates regulares. Diferente do RecordRTC que não recebe updates no npm há 5 anos, esta biblioteca tem publicações frequentes.

## Abordagens técnicas: MediaRecorder vs WebCodecs vs AudioWorklet

Três caminhos distintos existem para captura de áudio, cada um com trade-offs específicos para gravação de voz:

**MediaRecorder API** oferece a implementação mais simples—basta instanciar com um MediaStream e configurar codec/bitrate. Funciona nativamente em todos os browsers modernos, mas oferece controle limitado: não permite ajustar sample rate real (browsers ignoram constraints), não expõe parâmetros avançados do Opus, e força uso de containers webm/ogg/mp4. Para voz com **64kbps Opus mono**, a qualidade é excelente apesar das limitações.

**WebCodecs API** representa o futuro com ~94% de suporte global em janeiro 2026. O AudioEncoder oferece controle fino sobre codec, bitrate (CBR/VBR), sample rate e channels. Requer mais código—você precisa combinar com MediaStreamTrackProcessor para capturar frames e adicionar um muxer (mp4-muxer ou webm-muxer) para criar arquivos reproduzíveis. Safari 26+ terá suporte completo ao AudioEncoder; versões anteriores (16.4-18.x) suportam apenas VideoDecoder.

**AudioWorklet + encoding manual** proporciona máxima qualidade e flexibilidade. O processor roda em thread dedicado de áudio, recebendo 128 samples (2.67ms) por callback a 48kHz. Você captura Float32 PCM puro e pode aplicar qualquer encoder: WAV via audiobuffer-to-wav, FLAC via libflac.js, ou Opus via opus-recorder. Esta abordagem permite processamento DSP customizado antes da codificação.

| Aspecto | MediaRecorder | WebCodecs | AudioWorklet |
|---------|--------------|-----------|--------------|
| Latência | 100-500ms | 20-50ms | **2.5-10ms** |
| Controle de codec | Mínimo | Total | Total (via encoder) |
| Complexidade | Baixa | Alta | Alta |
| Sample rate máx | 48kHz (browser) | 48kHz (config) | **96kHz+** |
| Bit depth | Depende do codec | 32-bit float | **32-bit float** |

## Configurações ideais para gravação de voz/narração

Para videoaulas educacionais, a configuração otimizada balanceia qualidade broadcast com tamanho de arquivo prático:

**Sample rate**: **48kHz** é o padrão recomendado. Coincide com a taxa interna do Opus, é o padrão da indústria de vídeo, e oferece headroom adequado para anti-aliasing. Voz humana tem fundamentais em 85-255Hz com harmônicos até ~12kHz—48kHz captura tudo com margem.

**Bit depth**: **16-bit PCM** é suficiente para voz. O range dinâmico de 96dB supera qualquer ambiente de gravação doméstico. 24-bit só faz sentido se o hardware do microfone realmente captura em 24-bit (raro em webcams/microfones USB básicos). O Web Audio API trabalha internamente em 32-bit float, então a conversão só ocorre na codificação final.

**Channels**: **Mono** para narração pura. Reduz tamanho de arquivo pela metade e simplifica processamento. Estéreo só se houver elementos musicais ou efeitos sonoros na gravação.

**Codec para entrega**: **Opus a 32-64kbps** oferece qualidade transparente para voz. O codec usa SILK (otimizado para fala) automaticamente em bitrates baixos. Para comparação: 32kbps Opus supera 128kbps MP3 em testes ABX para voz.

**Formato para arquivamento**: **WAV 48kHz/16-bit** ou **FLAC** (40-60% do tamanho do WAV com qualidade idêntica). Grave sempre lossless inicialmente; comprima para Opus apenas na exportação final.

```javascript
// Configuração recomendada para EduScript AI
const voiceRecordingConfig = {
  sampleRate: 48000,
  channels: 1,
  bitDepth: 16,
  // Para Opus (entrega)
  opusBitrate: 48000, // 48kbps - sweet spot para voz
  // Para arquivamento
  archiveFormat: 'WAV' // ou 'FLAC' via libflac.js
};
```

## Chain de processamento em tempo real para voz

O pipeline ideal para narração educacional processa o áudio em estágios sequenciais, cada um resolvendo um problema específico:

```
Microfone → High-pass (80Hz) → Noise Suppression → Noise Gate → Compressor → Limiter → Output
```

**High-pass filter a 80-100Hz** remove rumble de ar condicionado, tráfego, e vibração de mesa. Para voz masculina use 80Hz; feminina 100-120Hz. Implemente via BiquadFilterNode nativo:

```javascript
const highpass = audioCtx.createBiquadFilter();
highpass.type = 'highpass';
highpass.frequency.value = 85; // Hz
highpass.Q.value = 0.7; // ~12dB/octave
```

**Noise suppression** já está coberto pelo RNNoise no projeto. Alternativa interessante: **@sapphi-red/web-noise-suppressor** oferece três opções em um pacote—NoiseGateWorkletNode, RnnoiseWorkletNode, e SpeexWorkletNode—todas baseadas em AudioWorklet para baixa latência.

**Compressor** nivela dinâmica, tornando partes suaves mais audíveis sem distorcer picos. Configuração otimizada para voz:

```javascript
const compressor = audioCtx.createDynamicsCompressor();
compressor.threshold.value = -20; // dB - inicia compressão
compressor.ratio.value = 4;       // 4:1 - suave para voz
compressor.attack.value = 0.003;  // 3ms - preserva consoantes
compressor.release.value = 0.025; // 25ms - evita pumping
compressor.knee.value = 6;        // transição suave
```

**Limiter** funciona como safety net final, prevenindo clipping mesmo com picos inesperados. Use DynamicsCompressor com ratio extremo:

```javascript
const limiter = audioCtx.createDynamicsCompressor();
limiter.threshold.value = -3;  // ceiling 3dB abaixo de 0
limiter.ratio.value = 20;      // compressão extrema
limiter.attack.value = 0.001;  // 1ms - resposta rápida
limiter.knee.value = 0;        // hard knee
```

## Gravação em formatos lossless no browser

Para arquivamento de qualidade máxima, duas opções principais funcionam client-side:

**WAV via extendable-media-recorder-wav-encoder** é a solução mais elegante para React/TypeScript:

```javascript
import { MediaRecorder, register } from 'extendable-media-recorder';
import { connect } from 'extendable-media-recorder-wav-encoder';

// Registra encoder WAV uma vez na inicialização
await register(await connect());

// Uso idêntico ao MediaRecorder nativo
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream, { mimeType: 'audio/wav' });

const chunks = [];
recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = () => {
  const wavBlob = new Blob(chunks, { type: 'audio/wav' });
  // wavBlob contém PCM 16-bit lossless
};
```

**FLAC via libflac.js** reduz tamanho em ~50% mantendo qualidade idêntica. Requer Web Worker para encoding:

```javascript
// Worker: encoder-worker.js
importScripts('libflac.min.wasm.js');

Flac.onready = function() {
  const encoder = Flac.create_libflac_encoder(
    48000,  // sample rate
    1,      // channels
    16,     // bits per sample
    5       // compression level (0-8)
  );
  // Encoder pronto para receber PCM chunks
};
```

**opus-recorder** oferece alternativa com suporte a WAV 8/16/24/32-bit através da opção `wavBitDepth`:

```javascript
import Recorder from 'opus-recorder';

const recorder = new Recorder({
  encoderPath: 'encoderWorker.min.js',
  wavBitDepth: 24, // Suporta 8, 16, 24, 32-bit
  numberOfChannels: 1,
  sampleRate: 48000
});
```

## Compatibilidade cross-browser e polyfills

O ecossistema de áudio web tem nuances importantes por browser que impactam diretamente a arquitetura:

| Browser | MediaRecorder | AudioWorklet | WebCodecs |
|---------|--------------|--------------|-----------|
| Chrome 94+ | ✅ webm/opus | ✅ | ✅ Full |
| Firefox 130+ | ✅ ogg/opus | ✅ | ✅ Full |
| Safari 18.4+ | ✅ mp4/aac | ✅ | ◐ Parcial |
| Safari 26+ (TP) | ✅ +ALAC/PCM! | ✅ | ✅ Full |
| iOS Safari | ✅ mp4/aac | ✅ | ◐ Parcial |

**Safari** merece atenção especial: versões 14.3-18.x suportam apenas MP4/AAC nativamente. O Safari Technology Preview 214+ adiciona suporte revolucionário a `audio/mp4;codecs=alac` e `audio/mp4;codecs=pcm`—gravação lossless nativa! Para produção atual, use **extendable-media-recorder** que funciona em Safari 18.4+.

**Estratégia de fallback progressivo**:

```javascript
async function createCrossCompatibleRecorder(stream) {
  // 1. Tenta WebM/Opus nativo (Chrome/Firefox)
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return new window.MediaRecorder(stream, { 
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 48000
    });
  }
  
  // 2. Tenta MP4/AAC nativo (Safari)
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return new window.MediaRecorder(stream, { mimeType: 'audio/mp4' });
  }
  
  // 3. Fallback para WAV via polyfill
  const { MediaRecorder, register } = await import('extendable-media-recorder');
  const { connect } = await import('extendable-media-recorder-wav-encoder');
  await register(await connect());
  return new MediaRecorder(stream, { mimeType: 'audio/wav' });
}
```

**Headers CORS necessários** para SharedArrayBuffer (usado por alguns WASM encoders):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**User gesture requirement** é obrigatório em todos os browsers modernos—AudioContext deve ser criado ou resumed após interação do usuário:

```javascript
const audioCtx = new AudioContext();
document.addEventListener('click', () => audioCtx.resume(), { once: true });
```

## Arquitetura sugerida para EduScript AI

Considerando a stack existente (React 19, Vite 6, TypeScript 5.8, RNNoise, ebur128, FFmpeg.wasm), a arquitetura recomendada integra os componentes assim:

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Component                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │     useAudioRecorder() - Custom Hook                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    AudioContext (48kHz)                          │
│  ┌──────┐   ┌─────────┐   ┌─────────┐   ┌──────────┐   ┌─────┐ │
│  │ Mic  │→→→│ Highpass│→→→│ RNNoise │→→→│Compressor│→→→│Limit│ │
│  │Source│   │ 85Hz    │   │ Worklet │   │  -20dB   │   │-3dB │ │
│  └──────┘   └─────────┘   └─────────┘   └──────────┘   └──┬──┘ │
└─────────────────────────────────────────────────────────────┼───┘
                                                              │
┌─────────────────────────────────────────────────────────────▼───┐
│              Recording Destination                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ extendable-media-recorder (WAV) ou MediaRecorder (Opus)   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Exemplo de implementação do hook**:

```typescript
// useVoiceRecorder.ts
import { useCallback, useRef, useState } from 'react';
import { MediaRecorder, register } from 'extendable-media-recorder';
import { connect } from 'extendable-media-recorder-wav-encoder';

interface VoiceRecorderOptions {
  format: 'wav' | 'opus';
  onDataAvailable?: (blob: Blob) => void;
}

export function useVoiceRecorder(options: VoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const startRecording = useCallback(async () => {
    // Registra WAV encoder se necessário
    if (options.format === 'wav') {
      await register(await connect());
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 48000,
        echoCancellation: false,  // Desativa para controle manual
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    
    // Cria processing chain
    const ctx = new AudioContext({ sampleRate: 48000 });
    audioContextRef.current = ctx;
    
    const source = ctx.createMediaStreamSource(stream);
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 85;
    
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 4;
    
    const destination = ctx.createMediaStreamDestination();
    
    source.connect(highpass)
          .connect(compressor)
          .connect(destination);
    
    // Cria recorder com stream processado
    const recorder = new MediaRecorder(destination.stream, {
      mimeType: options.format === 'wav' ? 'audio/wav' : 'audio/webm;codecs=opus',
      audioBitsPerSecond: 48000
    });
    
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { 
        type: options.format === 'wav' ? 'audio/wav' : 'audio/webm' 
      });
      options.onDataAvailable?.(blob);
    };
    
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }, [options]);
  
  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    audioContextRef.current?.close();
    setIsRecording(false);
  }, []);
  
  return { isRecording, startRecording, stopRecording };
}
```

## Conclusão

A combinação de **extendable-media-recorder** para captura WAV lossless, **Web Audio API nativa** para processamento em tempo real (high-pass, compressor, limiter), e **RNNoise** para noise suppression oferece a melhor relação qualidade/complexidade para o EduScript AI. Esta stack funciona em todos os browsers modernos incluindo Safari, é totalmente TypeScript-first, e permite gravação a 48kHz/16-bit com latência mínima.

Para o fluxo de produção de videoaulas, grave sempre em WAV lossless para máxima flexibilidade de edição. Na exportação final, use FFmpeg.wasm para converter para Opus 48kbps—qualidade broadcast em arquivos minúsculos. O VAD via @ricky0123/vad-react pode automatizar detecção de silêncios para facilitar edição posterior.

A principal decisão arquitetural é evitar RecordRTC (abandonado) e preferir a abordagem modular: bibliotecas pequenas e especializadas que se compõem bem, em vez de frameworks monolíticos. Esta filosofia alinha-se com o ecossistema React moderno e facilita manutenção a longo prazo.