# Bibliotecas JavaScript para processamento de áudio client-side em 2024-2025

Para concatenação de áudio no browser, **Crunker** é a escolha definitiva com apenas **2KB gzipped**, TypeScript nativo, e API simples. Para normalização LUFS, mantenha **ebur128-wasm** para medição e aplique ganho via Web Audio API — esta combinação oferece o melhor equilíbrio entre precisão EBU R128, bundle size, e integração com seu stack existente.

O projeto EduScript AI já possui a maior parte da infraestrutura necessária (Web Audio API, Tone.js, wavesurfer.js, ebur128-wasm, FFmpeg.wasm). A adição de Crunker resolve a concatenação de forma elegante, e a normalização pode ser implementada com código nativo usando os dados do ebur128-wasm.

---

## Concatenação de áudio: Crunker domina a categoria

**Crunker** é a única biblioteca dedicada a concatenação que vale considerar. Com **457 stars no GitHub**, zero dependências, e escrita inteiramente em TypeScript (73.6%), ela resolve exatamente o problema de juntar múltiplos `AudioBuffer` ou `File` em um único arquivo.

| Métrica | Valor |
|---------|-------|
| Bundle Size | **2KB gzip** (~7KB minified) |
| TypeScript | ✅ Nativo com `.d.ts` incluído |
| Última versão | v2.4.1 (Janeiro 2024) |
| npm downloads | ~5.000-7.000/semana |
| Safari | ✅ (exceto formato .ogg) |

A API é extremamente direta:

```typescript
import Crunker from 'crunker';

const crunker = new Crunker({ sampleRate: 48000 });

// Concatenar arquivos de diferentes fontes
const buffers = await crunker.fetchAudio(file1, file2, '/audio/intro.mp3');
const concatenated = crunker.concatAudio(buffers);  // → AudioBuffer
const { blob, url } = crunker.export(concatenated, 'audio/wav');
```

Métodos disponíveis incluem `concatAudio()` para junção sequencial, `mergeAudio()` para sobreposição (mixagem), `padAudio()` para adicionar silêncio, e `sliceAudio()` com suporte a fade in/out. O export sempre gera WAV internamente, independente do MIME type especificado.

**Limitações conhecidas**: Issue #22 reporta pequenos "hiccups" nas junções em alguns casos; Issue #15 indica que sample rates diferentes podem causar pitch shifts — sempre especifique `sampleRate` explicitamente no construtor para evitar isso.

### Alternativas avaliadas para concatenação

**audiobuffer-to-wav** (157 stars, ~30.000 downloads/semana) é útil apenas para exportação — converte `AudioBuffer` para WAV com suporte a 16-bit PCM e 32-bit float. Não faz concatenação, mas combina bem com processamento nativo. Types via `@types/audiobuffer-to-wav`.

**Tone.js** (14.600+ stars) pode concatenar via `Tone.Offline()`, mas é overkill para este caso específico — adiciona ~50KB gzipped quando você já tem Crunker com 2KB. Reserve Tone.js para scheduling complexo e síntese.

**web-audio-api-player** (22 stars) foca em playback com gerenciamento de filas — não tem capacidade de concatenação.

**audio-concatenate** como pacote npm não existe para browser. O pacote `audioconcat` é server-side com dependência de FFmpeg binário.

---

## Normalização de volume: ebur128-wasm + GainNode

Para normalização LUFS client-side, o ecossistema é mais limitado. Seu setup atual com **ebur128-wasm** já representa a melhor opção para **medição** EBU R128 precisa. A **aplicação do ganho** deve ser feita separadamente via Web Audio API.

### Arquitetura recomendada para normalização

```typescript
import { EbuR128, Mode } from 'ebur128-wasm';

interface NormalizationResult {
  buffer: AudioBuffer;
  originalLUFS: number;
  gainAppliedDB: number;
}

async function normalizeToTarget(
  buffer: AudioBuffer, 
  targetLUFS: number = -14  // Padrão Spotify/YouTube
): Promise<NormalizationResult> {
  // 1. Medir loudness integrado
  const ebur128 = new EbuR128(
    buffer.sampleRate, 
    buffer.numberOfChannels,
    Mode.I | Mode.LRA
  );
  
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    ebur128.addFrames(buffer.getChannelData(ch));
  }
  
  const originalLUFS = ebur128.loudnessGlobal();
  const gainDB = targetLUFS - originalLUFS;
  
  // 2. Aplicar ganho via OfflineAudioContext
  const ctx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  
  source.buffer = buffer;
  gainNode.gain.value = Math.pow(10, gainDB / 20);
  
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start();
  
  return {
    buffer: await ctx.startRendering(),
    originalLUFS,
    gainAppliedDB: gainDB
  };
}
```

### Alternativas ao ebur128-wasm

**@domchristie/needles** (67 stars) é a alternativa mais promissora — biblioteca JavaScript pura (**~15KB**) com medição momentânea, short-term, e integrada. Usa Web Workers para não bloquear a thread principal. Porém, **não tem TypeScript nativo** e **não suporta Safari**. Também não implementa true peak nem LRA ainda.

**ffmpeg.wasm** pode normalizar com o filtro `loudnorm`, mas o bundle de **~20MB** é proibitivo para esta única funcionalidade. Reserve para conversão de formatos quando necessário.

**lufs.js** (20 stars) implementa padrão mais antigo (BS.1770-2 vs BS.1770-4 atual) e não está no npm — apenas GitHub. Não recomendado.

**js-audio-normalizer** (35 stars) usa ReplayGain, **não EBU R128** — inadequado para normalização LUFS profissional.

| Biblioteca | Stars | LUFS | True Peak | TypeScript | Bundle | Mantida |
|------------|-------|------|-----------|------------|--------|---------|
| ebur128-wasm | 1 | ✅ Full | ✅ | ✅ Nativo | ~200KB | ⚠️ 3 anos |
| needles | 67 | ✅ Parcial | ❌ | ❌ | ~15KB | ⚠️ |
| ffmpeg.wasm | 16.900 | ✅ Full | ✅ | ✅ Nativo | ~20MB | ✅ Ativo |
| Web Audio nativo | N/A | ❌ | ❌ | ✅ | 0KB | ✅ |

---

## Bibliotecas gerais de áudio: utilidade limitada para seu caso

**Howler.js** (25.000 stars, 580.000 downloads/semana) é a biblioteca mais popular, mas foca em **playback**, não processamento. Não oferece concatenação nem normalização — apenas controle de volume básico. O handling automático de audio unlock no iOS é excelente, mas você já tem isso via Tone.js.

**Pizzicato** (1.700 stars) está **abandonado há 7 anos**. Tem compressor dinâmico que poderia ajudar com normalização, mas não deve ser adicionado a projetos novos.

**standardized-audio-context** (700 stars) é um ponyfill para consistência cross-browser da Web Audio API — TypeScript nativo e bem mantido, mas não adiciona funcionalidades além de padronização de API. Seu projeto provavelmente não precisa disso.

**Peaks.js** (BBC, 3.400 stars) é excelente para visualização de waveforms com markers e segmentos, mas é **redundante com wavesurfer.js** que você já usa.

---

## Web Audio API nativa vs bibliotecas

Para operações básicas, a API nativa é frequentemente suficiente e **10x mais rápida** que implementações JavaScript equivalentes. O TypeScript moderno (4.x+) inclui tipos completos em `lib.dom.d.ts` — não precisa de `@types/webaudioapi` (deprecated).

### Concatenação nativa (sem Crunker)

```typescript
async function concatenateBuffers(
  context: AudioContext, 
  buffers: AudioBuffer[]
): Promise<AudioBuffer> {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const output = context.createBuffer(
    buffers[0].numberOfChannels, 
    totalLength, 
    buffers[0].sampleRate
  );
  
  let offset = 0;
  for (const buffer of buffers) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      output.getChannelData(ch).set(buffer.getChannelData(ch), offset);
    }
    offset += buffer.length;
  }
  return output;
}
```

A versão nativa exige ~15 linhas de código versus 3 linhas com Crunker. Para projetos simples a nativa funciona, mas Crunker oferece melhor ergonomia com `sliceAudio()`, `padAudio()`, e export integrado por apenas **2KB extras**.

### Performance de nodes Web Audio

| Node | Custo CPU | Observações |
|------|-----------|-------------|
| GainNode | Muito baixo | Gecko: "essencialmente grátis" quando constante |
| BiquadFilterNode | Baixo | 5 multiplicações + 4 adições por sample |
| DynamicsCompressorNode | Médio | Look-ahead processing |
| ConvolverNode | **Muito alto** | Múltiplas FFTs por bloco |
| AnalyserNode | Médio-alto | Computação FFT |

**OfflineAudioContext** processa "o mais rápido possível" — não está limitado a tempo real. Use para normalização em batch de múltiplos clips.

---

## Considerações cross-browser para Safari

Safari introduz peculiaridades que afetam qualquer aplicação de áudio client-side:

**User gesture obrigatório** — AudioContext inicia em estado `suspended` no iOS. Deve ser resumido após interação do usuário:

```typescript
document.addEventListener('click', async () => {
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
}, { once: true });
```

**Estado "interrupted"** exclusivo do Safari/iOS pode travar o contexto. A solução requer nova interação do usuário — `resume()` pode não funcionar sem gesto.

**Formatos suportados** — Safari não suporta OGG/Vorbis. Use **MP3 ou WAV** para compatibilidade universal. WebM Opus teve problemas no Safari 15.

**Limite de AudioContexts** — Safari permite máximo de 4 contextos simultâneos, e `sampleRate` não pode ser definido no construtor.

Firefox e Chrome têm diferenças menores: Firefox usa resampling de alta qualidade (mais latência), Chrome usa linear (mais rápido, qualidade menor). Firefox é melhor com muitos eventos de AudioParam.

---

## Arquitetura recomendada para EduScript AI

Com base na análise, a configuração ideal para seu projeto:

```
┌─────────────────────────────────────────────────────────┐
│                Pipeline de Áudio EduScript              │
├─────────────────────────────────────────────────────────┤
│  Medição LUFS      │  ebur128-wasm (já em uso)         │
│                    │  → Mede loudness integrado         │
├────────────────────┼────────────────────────────────────┤
│  Normalização      │  Web Audio GainNode               │
│                    │  → Aplica ganho calculado          │
│                    │  → OfflineAudioContext para batch  │
├────────────────────┼────────────────────────────────────┤
│  Concatenação      │  Crunker (ADICIONAR - 2KB)        │
│                    │  → concatAudio() para junção       │
│                    │  → export() para WAV blob          │
├────────────────────┼────────────────────────────────────┤
│  Visualização      │  wavesurfer.js (já em uso)        │
├────────────────────┼────────────────────────────────────┤
│  Conversão formato │  FFmpeg.wasm (já em uso)          │
│  (quando preciso)  │  → Lazy load apenas se necessário │
└─────────────────────────────────────────────────────────┘
```

### Instalação

```bash
npm install crunker
# Types já incluídos, não precisa de @types
```

### Workflow completo de normalização + concatenação

```typescript
import Crunker from 'crunker';
import { EbuR128, Mode } from 'ebur128-wasm';

async function processAndConcatenateClips(
  clips: AudioBuffer[],
  targetLUFS: number = -14
): Promise<Blob> {
  const crunker = new Crunker({ sampleRate: 48000 });
  
  // 1. Normalizar cada clip para target LUFS
  const normalizedClips = await Promise.all(
    clips.map(async (clip) => {
      const { buffer } = await normalizeToTarget(clip, targetLUFS);
      return buffer;
    })
  );
  
  // 2. Concatenar clips normalizados
  const concatenated = crunker.concatAudio(normalizedClips);
  
  // 3. Exportar como WAV
  const { blob } = crunker.export(concatenated, 'audio/wav');
  
  return blob;
}
```

---

## Conclusão

A combinação **Crunker + ebur128-wasm + Web Audio GainNode** oferece o melhor custo-benefício para EduScript AI. O bundle adicional é de apenas **2KB** (Crunker), você mantém precisão EBU R128 via WASM, e a implementação é type-safe com TypeScript nativo.

Evite adicionar Howler.js, Pizzicato, ou standardized-audio-context — não resolvem seus problemas específicos. Reserve FFmpeg.wasm para conversão de formatos quando necessário, não para normalização básica. Para true peak limiting após normalização, considere `DynamicsCompressorNode` nativo ou `Tone.Limiter` que você já tem disponível.