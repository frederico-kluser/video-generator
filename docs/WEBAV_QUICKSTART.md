# Quick Start: Renderização WebAV

## Exemplo básico de uso

```typescript
import { useWebAVRenderer } from '@/shared/hooks/useWebAVRenderer';
import { toMicroseconds } from '@/shared/types/webav.types';

function VideoExportButton({ slides }) {
  const { render, isRendering, progress } = useWebAVRenderer({
    config: { width: 1920, height: 1080 },
    onProgress: (p) => console.log(`${Math.round(p.progress * 100)}%`),
  });

  const handleExport = async () => {
    // Converter slides para WebAVSlideConfig
    const webavSlides = slides.map((slide, index) => ({
      id: slide.id,
      imageUrl: slide.imageUrl,
      audioUrl: URL.createObjectURL(slide.audioBlob),
      duration: toMicroseconds(5), // 5 segundos
      offset: toMicroseconds(index * 5),
      zIndex: 1,
    }));

    const result = await render(webavSlides);
    
    // Download do vídeo
    const a = document.createElement('a');
    a.href = result.blobUrl;
    a.download = 'video.mp4';
    a.click();
  };

  return (
    <button onClick={handleExport} disabled={isRendering}>
      {isRendering ? `Exportando ${progress}%` : 'Exportar vídeo'}
    </button>
  );
}
```

## Verificar compatibilidade do navegador

```typescript
import { detectWebCodecsCapabilities } from '@/shared/utils/webav.utils';

const caps = detectWebCodecsCapabilities();

if (!caps.supported) {
  console.warn('WebCodecs não suportado. Use Chrome 102+');
  console.log('Status:', {
    VideoEncoder: caps.hasVideoEncoder,
    SharedArrayBuffer: caps.hasSharedArrayBuffer,
  });
}
```

## Converter áudio do projeto para WebAV

```typescript
import { convertAudioBufferForWebAV } from '@/shared/services/audioConversion.service';

// Se você tem AudioBuffer
const wavBlob = await convertAudioBufferForWebAV(audioBuffer, {
  sampleRate: 48000,
  channels: 1,
  normalize: true,
});

// Usar no WebAV
const audioUrl = URL.createObjectURL(wavBlob);
```

## Requisitos de deployment

### Vite/Dev Server

Já configurado em `vite.config.ts`:

```typescript
server: {
  headers: {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
  },
}
```

### Nginx (Produção)

```nginx
location / {
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
}
```

### Vercel

```json
// vercel.json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        }
      ]
    }
  ]
}
```

## Troubleshooting comum

### "SharedArrayBuffer is not defined"

- **Causa**: Headers CORS ausentes
- **Solução**: Configure os headers no servidor (ver acima)

### Performance lenta

- **Causa**: Imagens muito grandes
- **Solução**: Redimensione para resolução de saída (1920x1080)

### Navegador não suportado

- **Navegadores suportados**:
  - ✅ Chrome 102+
  - ✅ Edge 102+
  - ⚠️ Firefox 133+ (parcial)
  - ⚠️ Safari 16.6+ (apenas decode)

## Links úteis

- [Documentação completa](../docs/WEBAV_INTEGRATION.md)
- [WebAV GitHub](https://github.com/WebAV-Tech/WebAV)
- [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
