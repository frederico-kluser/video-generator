# Guia completo de referências de estilo no gpt-image-1.5

**A OpenAI não oferece um parâmetro dedicado de "style reference"** — mas o modelo gpt-image-1.5 suporta transfer de estilo através do endpoint `/images/edits`, aceitando até **16 imagens de referência** que podem ser combinadas com prompts descritivos para manter consistência visual. O parâmetro `input_fidelity="high"` é a funcionalidade mais próxima de um controle explícito de estilo, preservando características faciais, texturas e detalhes das imagens de entrada.

O gpt-image-1.5, lançado em **16-17 de dezembro de 2025**, representa um avanço significativo sobre o gpt-image-1: é **4x mais rápido**, **20% mais barato**, e oferece melhor consistência de estilo entre edições consecutivas. Diferente de técnicas como ControlNet e IP-Adapter que usam módulos especializados, a OpenAI implementa style transfer através de um modelo multimodal nativo onde imagens e texto são processados de forma unificada.

## O endpoint images/edits é a chave para referências de estilo

O endpoint `/v1/images/edits` é o único caminho na API da OpenAI para trabalhar com imagens de referência. Funciona assim: você envia uma ou mais imagens junto com um prompt que descreve como utilizar essas referências. O modelo então gera uma nova imagem incorporando elementos das entradas.

**Parâmetros principais do endpoint:**

| Parâmetro        | Valores                 | Descrição                                               |
| ---------------- | ----------------------- | ------------------------------------------------------- |
| `image`          | array de arquivos       | Até 16 imagens (PNG/WebP/JPG, máx 50MB cada)            |
| `prompt`         | string                  | Descrição do resultado desejado (até 32.000 caracteres) |
| `input_fidelity` | "high" ou "low"         | Controla preservação de detalhes faciais e texturas     |
| `quality`        | "low", "medium", "high" | Nível de qualidade da saída                             |
| `output_format`  | "png", "jpeg", "webp"   | Formato de saída (PNG suporta transparência)            |
| `size`           | string                  | 1024x1024, 1536x1024, 1024x1536, ou "auto"              |

**Importante:** O parâmetro `input_fidelity="high"` funciona apenas no gpt-image-1 e gpt-image-1.5 — não está disponível no gpt-image-1-mini. No gpt-image-1.5, as primeiras **5 imagens** são preservadas com maior fidelidade automaticamente.

## Não existe parâmetro style_reference na API

Uma pesquisa detalhada na documentação oficial confirma: **não há parâmetros chamados `style_reference`, `image_reference` ou similares**. A OpenAI optou por uma abordagem baseada em prompting em vez de controles explícitos de estilo.

O único parâmetro relacionado a "estilo" é o `style` (valores "vivid" ou "natural"), mas **está disponível apenas para DALL-E 3** (modelo deprecated, suporte até maio de 2026) e não nos modelos GPT-image.

A transferência de estilo deve ser feita através de:

1. **Imagens de entrada** via endpoint `/images/edits`
2. **Prompts descritivos** que especificam como usar o estilo
3. **Parâmetro `input_fidelity`** para preservar características visuais

## Técnicas de prompting para consistência de estilo

A chave para manter consistência entre múltiplas gerações está no design cuidadoso dos prompts. O cookbook oficial da OpenAI documenta padrões específicos que funcionam bem.

**Padrão para style transfer direto:**

```
Use the same style from the input image (palette, texture, brushwork,
lighting, composition) and generate [novo conteúdo]. Preserve the visual
language while changing only the subject/scene.
```

**Padrão para composição multi-imagem:**

```
Image 1: style reference
Image 2: subject to transform
Apply the artistic style, color palette, and rendering technique from
Image 1 to transform the subject in Image 2. Maintain the exact pose
and composition of Image 2.
```

**Técnicas essenciais para consistência:**

- **Restabelecimento de invariantes**: Repita em cada prompt o que deve permanecer constante (cor dos olhos, estilo de cabelo, paleta de cores)
- **Uso de âncoras**: Crie uma imagem "canônica" inicial e use-a como referência em todas as gerações subsequentes
- **Constraints explícitas**: Use "change only X" + "keep everything else the same"
- **Templates reutilizáveis**: Defina frases de estilo fixas como "horizontal 16:9 digital vaporwave illustration, neon gradients" e use consistentemente
- **Referência por índice**: Numere as imagens no prompt ("Image 1", "Image 2") para clareza

## Código JavaScript/TypeScript para usar referências

### Exemplo básico de style transfer

```typescript
import fs from 'fs';
import OpenAI, { toFile } from 'openai';

const client = new OpenAI();

// Carregar imagem de referência de estilo
const styleReference = await toFile(
  fs.createReadStream('style_reference.png'),
  null,
  { type: 'image/png' },
);

const response = await client.images.edit({
  model: 'gpt-image-1.5',
  image: [styleReference],
  prompt: `Use the same style from the input image (palette, texture, 
brushwork, lighting) and generate a portrait of a woman in a garden. 
Maintain the artistic technique and color scheme exactly.`,
  size: '1024x1024',
  quality: 'high',
  output_format: 'png',
});

// Salvar resultado
const imageBase64 = response.data[0].b64_json;
const imageBytes = Buffer.from(imageBase64, 'base64');
fs.writeFileSync('styled_output.png', imageBytes);
```

### Exemplo com múltiplas imagens de referência

```typescript
import fs from 'fs';
import OpenAI, { toFile } from 'openai';

const client = new OpenAI();

// Carregar múltiplas imagens
const imageFiles = [
  'style_reference.png', // Imagem 1: referência de estilo
  'subject_photo.jpg', // Imagem 2: sujeito a transformar
  'background_ref.png', // Imagem 3: referência de ambiente
];

const images = await Promise.all(
  imageFiles.map(
    async (file) =>
      await toFile(fs.createReadStream(file), null, {
        type: file.endsWith('.png') ? 'image/png' : 'image/jpeg',
      }),
  ),
);

const response = await client.images.edit({
  model: 'gpt-image-1.5',
  image: images,
  prompt: `
    Image 1: artistic style reference
    Image 2: subject photograph
    Image 3: environment reference
    
    Transform the person from Image 2 into the artistic style of Image 1.
    Place them in an environment inspired by Image 3.
    Preserve the subject's facial features, pose, and expression exactly.
    Apply the color palette, brushwork, and rendering technique from Image 1.
  `,
  input_fidelity: 'high',
  quality: 'high',
  size: '1024x1536',
});

const outputBuffer = Buffer.from(response.data[0].b64_json, 'base64');
fs.writeFileSync('multi_reference_output.png', outputBuffer);
```

### Exemplo de workflow para consistência de personagem

```typescript
import OpenAI, { toFile } from 'openai';
import fs from 'fs';

const client = new OpenAI();

async function generateConsistentCharacter(
  anchorImagePath: string,
  scenes: string[],
): Promise<Buffer[]> {
  const anchorImage = await toFile(fs.createReadStream(anchorImagePath), null, {
    type: 'image/png',
  });

  const characterDescription = `
    Young woman, mid-20s, shoulder-length auburn hair, 
    green eyes, light skin tone, wearing blue denim jacket.
  `;

  const results: Buffer[] = [];

  for (const scene of scenes) {
    const response = await client.images.edit({
      model: 'gpt-image-1.5',
      image: [anchorImage],
      prompt: `
        Reference: anchor image showing the character
        
        Generate the SAME character (${characterDescription}) in a new scene:
        ${scene}
        
        CRITICAL: Preserve exact facial features, hair color, eye color,
        skin tone, and overall appearance from the reference.
        Change only the pose, clothing details, and background as needed.
      `,
      input_fidelity: 'high',
      quality: 'high',
    });

    results.push(Buffer.from(response.data[0].b64_json, 'base64'));
  }

  return results;
}

// Uso
const scenes = [
  'walking through a rainy city street at night',
  'sitting in a cozy coffee shop reading a book',
  'standing on a mountain summit at sunrise',
];

const characterImages = await generateConsistentCharacter(
  'character_anchor.png',
  scenes,
);
```

## Diferenças entre gpt-image-1 e gpt-image-1.5

O gpt-image-1.5, lançado em dezembro de 2025, trouxe melhorias significativas para manutenção de estilo:

| Aspecto                      | gpt-image-1                          | gpt-image-1.5                                              |
| ---------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| **Velocidade**               | Baseline (~40-60s)                   | **4x mais rápido** (~10-30s)                               |
| **Custo**                    | Baseline                             | **20% mais barato**                                        |
| **Imagens preservadas**      | Apenas 1ª imagem com alta fidelidade | **Primeiras 5 imagens** com alta fidelidade                |
| **Consistência de estilo**   | Boa                                  | **Excelente** (melhor preservação de lighting, composição) |
| **Seguimento de instruções** | Bom                                  | **Significativamente melhor**                              |
| **Renderização de texto**    | Boa                                  | **Excelente** (textos densos e pequenos)                   |
| **Edições multi-step**       | Drift perceptível                    | **Menor drift** entre iterações                            |
| **input_fidelity**           | Suportado                            | Suportado + melhor preservação facial                      |

**Implicação prática:** Para workflows de style transfer, o gpt-image-1.5 é claramente superior — a capacidade de preservar 5 imagens com alta fidelidade (versus apenas 1 no gpt-image-1) significa que você pode fornecer múltiplas referências de estilo e obter resultados mais consistentes.

## Limitações e formatos aceitos

**Formatos de entrada suportados:**

- PNG, WebP, JPG
- Tamanho máximo: **50MB por imagem**
- Quantidade máxima: **16 imagens por requisição**
- Para DALL-E 2 (deprecated): apenas PNG quadrado, máximo 4MB, apenas 1 imagem

**Formatos de saída:**

- PNG (padrão, suporta transparência)
- JPEG (mais rápido)
- WebP (suporta transparência, não disponível no Azure)

**Tamanhos de saída:**

- 1024x1024 (quadrado, mais rápido)
- 1024x1536 (retrato)
- 1536x1024 (paisagem)
- Até 4096x4096 com upscaling

**Limitações importantes:**

- **Sem parâmetro seed**: Não é possível reproduzir exatamente a mesma geração
- **Sem controle estrutural**: Diferente de ControlNet, não há como especificar mapas de profundidade ou poses
- **Character drift**: Mesmo com técnicas de consistência, há degradação gradual em longas sequências
- **Arquitetura black-box**: Não é possível fine-tunar ou adicionar adapters customizados
- **Output sempre em base64**: Modelos GPT-image não retornam URLs como DALL-E

## Comparação com ControlNet, IP-Adapter e outras técnicas

A abordagem da OpenAI é **fundamentalmente diferente** das técnicas de style transfer do ecossistema Stable Diffusion.

**ControlNet** usa redes condicionais que processam mapas de controle (bordas, profundidade, poses) para guiar a geração estrutural. É excelente para manter composição mas limitado para style transfer.

**IP-Adapter** (Tencent AI Lab) é um adapter leve (~22M parâmetros) que usa atenção cruzada desacoplada para injetar features de imagem diretamente no processo de geração. É a técnica mais eficaz para style transfer no ecossistema open-source.

| Característica          | OpenAI GPT-Image               | ControlNet                    | IP-Adapter                    |
| ----------------------- | ------------------------------ | ----------------------------- | ----------------------------- |
| **Mecanismo**           | Modelo multimodal nativo       | Encoder condicional separado  | Adapter de atenção cruzada    |
| **Style transfer**      | Via prompting + input_fidelity | Limitado (modos reference)    | **Excelente** (uso principal) |
| **Controle estrutural** | Apenas via prompt              | **Excelente** (poses, bordas) | Limitado                      |
| **Customização**        | Baixa (API apenas)             | Alta (pesos, steps)           | Média (scale)                 |
| **Composabilidade**     | Não combinável                 | Stackável (até 10)            | Combinável com ControlNet     |
| **Overhead**            | N/A (modelo único)             | ~700M+ params                 | ~22M params                   |

**Quando usar cada abordagem:**

- **OpenAI**: Conveniência, boa qualidade geral, excelente renderização de texto, sem setup
- **ControlNet + IP-Adapter**: Controle granular máximo, workflows customizados, custo mais baixo em volume

**Não existe integração direta** entre OpenAI e ControlNet/IP-Adapter. Um workaround híbrido possível: gerar conceitos com GPT-Image, extrair mapas de controle, refinar com SD+ControlNet.

## Conclusão

O modelo gpt-image-1.5 oferece capacidades de style transfer através do endpoint `/images/edits` com até 16 imagens de referência, combinando o parâmetro `input_fidelity="high"` com prompts descritivos bem estruturados. Embora não exista um parâmetro `style_reference` dedicado, a arquitetura multimodal nativa permite resultados impressionantes quando se utiliza as técnicas de prompting corretas — especialmente referenciando imagens por índice, reestabelecendo invariantes em cada geração, e criando "âncoras" visuais consistentes.

Para projetos que exigem controle estrutural preciso (poses específicas, composições exatas), técnicas como ControlNet + IP-Adapter no ecossistema Stable Diffusion ainda oferecem vantagens. Porém, para a maioria dos casos de uso de style transfer, o gpt-image-1.5 representa um excelente equilíbrio entre facilidade de uso, qualidade de output e velocidade de geração.
