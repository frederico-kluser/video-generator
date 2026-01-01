# WebAV: Guia completo para editores de vídeo no navegador

O **WebAV** é um SDK de edição de vídeo que processa mídia diretamente no navegador usando a API WebCodecs, oferecendo **20x mais performance** que FFmpeg.wasm com apenas **~50KB** compactados. Desenvolvido originalmente pela Bilibili e agora mantido pela WebAV-Tech, representa a abordagem mais moderna para processamento de vídeo client-side, aproveitando aceleração de hardware via GPU. Para projetos React 19 + TypeScript + Vite, a integração é direta com tipagem nativa e configuração mínima.

---

## Arquitetura baseada em WebCodecs API

O WebAV utiliza a **WebCodecs API** como fundamento, uma interface de baixo nível que fornece acesso direto aos codecs nativos do navegador. Diferente de soluções WebAssembly, não há download de binários pesados—o navegador usa seus próprios encoders/decoders H.264 e AAC com aceleração de hardware.

A arquitetura modular consiste em três pacotes principais:

| Pacote | Função | Tamanho |
|--------|--------|---------|
| `@webav/av-cliper` | Engine de processamento de mídia (clips, sprites, combinator) | ~647KB |
| `@webav/av-canvas` | Canvas interativo para edição visual com drag/drop | ~187KB |
| `@webav/av-recorder` | Gravação de MediaStream para MP4 | Leve |

O fluxo de dados segue um padrão de **streaming**: vídeos são processados como `ReadableStream<Uint8Array>`, evitando carregar arquivos inteiros na memória. Os **Clips** (MP4Clip, AudioClip, ImgClip) abstraem recursos de mídia, **Sprites** adicionam propriedades espaciais/temporais, e o **Combinator** sintetiza tudo em MP4 final.

**Requisitos de navegador:**
- Chrome 102+ ou Edge (suporte completo)
- Firefox 133+ (suporte parcial)
- Safari 16.6+ (apenas VideoDecoder)
- Contexto seguro (HTTPS obrigatório)

---

## Instalação e configuração para Vite

A instalação via npm é direta:

```bash
npm install @webav/av-cliper @webav/av-canvas @webav/av-recorder
```

O passo crítico é configurar os headers **Cross-Origin Isolation** para habilitar SharedArrayBuffer. No `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'cross-origin-isolation',
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          next();
        });
      },
      configurePreviewServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          next();
        });
      },
    },
  ],
  optimizeDeps: {
    include: ['@webav/av-cliper'],
  },
});
```

**TypeScript**: Os pacotes incluem definições de tipos nativamente—nenhum `@types` adicional necessário. Para produção (Nginx), adicione os headers:

```nginx
location / {
    add_header Cross-Origin-Opener-Policy "same-origin";
    add_header Cross-Origin-Embedder-Policy "require-corp";
}
```

---

## APIs principais e suas funções

### Clips: a base de todo conteúdo

Os **Clips** implementam a interface `IClip` que fornece acesso baseado em tempo via método `tick()`:

```typescript
import { MP4Clip, AudioClip, ImgClip, renderTxt2ImgBitmap } from '@webav/av-cliper';

// Vídeo MP4
const videoClip = new MP4Clip((await fetch('./video.mp4')).body!);
await videoClip.ready; // Aguarda metadados

// Áudio com loop e volume
const audioClip = new AudioClip((await fetch('./music.mp3')).body!, {
  loop: true,
  volume: 0.5
});

// Imagem de texto renderizada
const textBitmap = await renderTxt2ImgBitmap(
  'Marca d\'água',
  'font-size:40px; color:white; text-shadow:2px 2px 6px black;'
);
const textClip = new ImgClip(textBitmap);
```

### Sprites: posicionamento espacial e temporal

**OffscreenSprite** (processamento em background) e **VisibleSprite** (interativo) envolvem clips com propriedades de posição, tempo e animação:

```typescript
import { OffscreenSprite } from '@webav/av-cliper';

const sprite = new OffscreenSprite(videoClip);
sprite.time = { offset: 0, duration: 10e6 }; // 10 segundos (microsegundos!)
sprite.rect = { x: 0, y: 0, w: 1280, h: 720 };
sprite.zIndex = 1;
sprite.opacity = 1;

// Animação CSS-like
sprite.setAnimation({
  '0%': { x: 0, y: 0, opacity: 0 },
  '50%': { x: 640, y: 360, opacity: 1 },
  '100%': { x: 1280, y: 720, opacity: 0 }
}, { duration: 2e6, iterCount: 1 });
```

### AVCanvas: edição interativa em tempo real

```typescript
import { AVCanvas } from '@webav/av-canvas';
import { VisibleSprite, MP4Clip } from '@webav/av-cliper';

const avCanvas = new AVCanvas(document.getElementById('editor')!, {
  width: 1280,
  height: 720
});

const videoSprite = new VisibleSprite(
  new MP4Clip((await fetch('./video.mp4')).body!)
);
await avCanvas.add(videoSprite); // Usuário pode arrastar/redimensionar

// Controles de playback
avCanvas.play();
avCanvas.pause();
avCanvas.seek(5e6); // Pula para 5 segundos

// Exportar para Combinator
const combinator = await avCanvas.createCombinator();
```

### Combinator: síntese e exportação

```typescript
import { Combinator, OffscreenSprite, MP4Clip } from '@webav/av-cliper';

const combinator = new Combinator({ width: 1920, height: 1080 });

await combinator.addSprite(videoSprite, { main: true }); // Define duração
await combinator.addSprite(watermarkSprite);

// Output como stream (não bloqueia memória)
const outputStream: ReadableStream<Uint8Array> = combinator.output();

// Salvar com File System Access API
const fileHandle = await window.showSaveFilePicker({
  suggestedName: 'video-editado.mp4',
  types: [{ accept: { 'video/mp4': ['.mp4'] } }]
});
const writable = await fileHandle.createWritable();
await outputStream.pipeTo(writable);
```

---

## Implementando recursos de edição de vídeo

### Corte (trim) de vídeos

```typescript
// Método 1: Via sprite.time
const sprite = new OffscreenSprite(videoClip);
sprite.time = { offset: 0, duration: 10e6 }; // Apenas primeiros 10s

// Método 2: Via split() para cortes precisos
const [parte1, parte2, parte3] = await videoClip.split([5e6, 15e6]);
// Resulta: [0-5s, 5-15s, 15s-fim]
```

### Junção de múltiplos vídeos

```typescript
async function mergeVideos(urls: string[]) {
  const combinator = new Combinator({ width: 1280, height: 720 });
  let offset = 0;
  
  for (const url of urls) {
    const clip = new MP4Clip((await fetch(url)).body!);
    await clip.ready;
    
    const sprite = new OffscreenSprite(clip);
    sprite.time = { offset, duration: clip.meta.duration };
    await combinator.addSprite(sprite);
    
    offset += clip.meta.duration;
  }
  
  return combinator.output();
}
```

### Adição de áudio de fundo

```typescript
// Silenciar vídeo original
const videoClip = new MP4Clip(stream, { audio: false });

// Adicionar música
const musicSprite = new OffscreenSprite(
  new AudioClip((await fetch('./music.mp3')).body!, { loop: true })
);

await combinator.addSprite(videoSprite, { main: true });
await combinator.addSprite(musicSprite);
```

### Picture-in-Picture e overlays

```typescript
// Vídeo principal fullscreen
const mainSprite = new OffscreenSprite(mainClip);
mainSprite.rect = { x: 0, y: 0, w: 1280, h: 720 };
mainSprite.zIndex = 1;

// PiP no canto
const pipSprite = new OffscreenSprite(pipClip);
pipSprite.rect = { x: 900, y: 20, w: 360, h: 200 };
pipSprite.zIndex = 10;

// Logo com transparência
const logoSprite = new OffscreenSprite(new ImgClip(logoBitmap));
logoSprite.opacity = 0.7;
logoSprite.rect = { x: 20, y: 650, w: 100, h: 50 };
```

---

## Integração com React 19 usando hooks

```tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { MP4Clip, VisibleSprite, Combinator } from '@webav/av-cliper';
import { AVCanvas } from '@webav/av-canvas';

interface TimelineClip {
  id: string;
  sprite: VisibleSprite;
  duration: number;
}

export function useVideoEditor(width = 1280, height = 720) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<AVCanvas | null>(null);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  // Inicialização do canvas
  useEffect(() => {
    if (!containerRef.current) return;
    
    const canvas = new AVCanvas(containerRef.current, { width, height });
    canvasRef.current = canvas;
    
    return () => {
      canvas.destroy();
      canvasRef.current = null;
    };
  }, [width, height]);

  // Adicionar vídeo
  const addVideo = useCallback(async (file: File) => {
    if (!canvasRef.current) return;
    
    const clip = new MP4Clip(file.stream());
    await clip.ready;
    
    const sprite = new VisibleSprite(clip);
    await canvasRef.current.add(sprite);
    
    setClips(prev => [...prev, {
      id: crypto.randomUUID(),
      sprite,
      duration: clip.meta.duration
    }]);
  }, []);

  // Exportar vídeo
  const exportVideo = useCallback(async () => {
    if (!canvasRef.current) return null;
    
    const combinator = await canvasRef.current.createCombinator();
    return combinator.output();
  }, []);

  const play = useCallback(() => {
    canvasRef.current?.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    canvasRef.current?.pause();
    setIsPlaying(false);
  }, []);

  return { containerRef, clips, isPlaying, addVideo, exportVideo, play, pause };
}
```

---

## WebAV versus FFmpeg.wasm: quando usar cada um

| Critério | WebAV | FFmpeg.wasm |
|----------|-------|-------------|
| **Performance** | **20x mais rápido** (GPU) | Software-only, ~2x mais lento que nativo |
| **Bundle** | **~50KB** gzipped | ~22MB (core completo) |
| **Codecs** | Limitado ao browser (H.264, AAC) | Todos (H.265, AV1, VP9, etc.) |
| **Firefox** | ❌ Não suportado | ✅ Funciona |
| **API** | Moderna, orientada a objetos | CLI emulado |
| **Memória** | Streaming eficiente | Virtual filesystem limitado |

**Escolha WebAV quando**: performance é crítica, target é Chrome/Edge, operações simples (corte, merge, overlays), bundle size importa.

**Escolha FFmpeg.wasm quando**: precisa de codecs específicos (HEVC, AV1), suporte a Firefox obrigatório, filtros complexos do FFmpeg, formatos legacy.

---

## Boas práticas e otimização de performance

### Gerenciamento de memória crítico

```typescript
// SEMPRE feche VideoFrames após uso
const { video: frame } = await clip.tick(time);
if (frame) {
  ctx.drawImage(frame, 0, 0);
  frame.close(); // Previne memory leaks de GPU!
}

// Cleanup completo no React
useEffect(() => {
  return () => {
    clips.forEach(c => c.sprite.destroy?.());
    canvas?.destroy();
  };
}, []);
```

### Web Workers para processamento pesado

```typescript
// worker.ts
self.onmessage = async (e) => {
  const { videoStream } = e.data;
  const clip = new MP4Clip(videoStream);
  await clip.ready;
  
  // Processar frames no worker
  const combinator = new Combinator({ width: 1280, height: 720 });
  // ...
  
  self.postMessage({ status: 'complete' });
};
```

### Tratamento de erros robusto

```typescript
try {
  const clip = new MP4Clip(stream);
  await clip.ready;
} catch (error) {
  if (error.name === 'NotSupportedError') {
    // Navegador não suporta WebCodecs
    showFallbackUI();
  } else if (error.name === 'EncodingError') {
    // Codec não suportado
    console.error('Formato de vídeo não suportado');
  }
}
```

**Unidades de tempo**: Toda a API usa **microsegundos** (1 segundo = `1e6` ou `1_000_000`).

**Recursos oficiais**:
- Repositório: https://github.com/WebAV-Tech/WebAV
- Demos interativos: https://webav-tech.github.io/WebAV/demo
- Documentação API: https://webav-tech.github.io/WebAV/_api/av-cliper/

---

## Conclusão

O WebAV representa uma mudança de paradigma para edição de vídeo no browser, aproveitando APIs nativas ao invés de portar soluções server-side para WebAssembly. Para projetos React modernos targeting Chromium, oferece a melhor combinação de **performance** (aceleração de hardware), **tamanho** (~50KB), e **DX** (API TypeScript intuitiva). A principal limitação é o suporte a navegadores—Firefox e Safari têm cobertura limitada de WebCodecs.

Para projetos em produção, considere um **fallback** para FFmpeg.wasm quando o usuário não estiver em Chrome/Edge, ou simplesmente informe os requisitos de navegador claramente. A arquitetura de streaming do WebAV também facilita o processamento de arquivos grandes sem estourar a memória do navegador.