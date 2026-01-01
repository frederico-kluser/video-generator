<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EduScript AI — React 19 + Vite 6 + TypeScript 5.8

Video generator otimizado para 2025 com arquitetura feature-based, React 19 e integrações com OpenAI (GPT-5.1-Codex-Max + GPT-image-1.5). O projeto segue as referências do Bulletproof React, Feature-Sliced Design e recomendações de especialistas como Matt Pocock.

## Stack & ferramentas

- **WebAV** (v1.x) como engine de renderização de vídeo com aceleração GPU via WebCodecs API — **20x mais rápido** que FFmpeg.wasm com apenas ~50KB compactados (ver [docs/WEBAV_INTEGRATION.md](docs/WEBAV_INTEGRATION.md))
- Pipeline de limpeza server-side (sherpa-onnx GTCRN + FFmpeg arnndn + DeepFilterNet) exposto no `/audio-lab`, comparando áudio bruto vs tratado em tempo quase real
- Laboratório `/audio-eq-lab` com equalizador 3 bandas via Web Audio API; grava três takes, soma tudo e entrega mix bruta e mix equalizada usando filtros `lowshelf`, `peaking` e `highshelf` (ver [src/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab.tsx](src/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab.tsx))

## Experiência visual 2025

- O tema "Aurora Lab" fica aplicado por padrão em todo o app, definindo os tokens de cor via CSS variables para manter a identidade visual.

## Rotas principais

| Rota            | Componente principal                                                                                        | Propósito                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `/`             | [VideoGenerationFlow](src/features/video-generation/components/VideoGenerationFlow/VideoGenerationFlow.tsx) | Fluxo completo de briefing → preview com stepper e debug mode |
| `/audio-lab`    | [AudioCleanupLab](src/features/audio-lab/components/AudioCleanupLab/AudioCleanupLab.tsx)                    | Compara áudio bruto vs pipelines remotos                      |
| `/audio-eq-lab` | [AudioEqualizerLab](src/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab.tsx)           | Equaliza e mixa três takes sequenciais                        |
| `/render-test`  | [RenderTestPage](src/features/render-test/components/RenderTestPage/RenderTestPage.tsx)                     | Valida bundles `.zip` ou `manifest.json` exportados           |

O roteador em [src/app/App.tsx](src/app/App.tsx) decide o módulo com base em `window.location.pathname`, enquanto a CTA [src/shared/components/AudioLabsCta/AudioLabsCta.tsx](src/shared/components/AudioLabsCta/AudioLabsCta.tsx) facilita alternar entre os laboratórios.

## Laboratórios de áudio

### Audio Cleanup Lab

Acesse `/audio-lab` para abrir o laboratório de limpeza. Agora o front-end apenas captura o áudio bruto (48 kHz mono) e envia para o backend Node.js, que expõe três pipelines selecionáveis: **sherpa-onnx GTCRN** (tempo real), **FFmpeg arnndn lq.rnnn** (hiss constante) e **DeepFilterNet** (qualidade máxima).

- O componente [src/features/audio-lab/components/AudioCleanupLab/AudioCleanupLab.tsx](src/features/audio-lab/components/AudioCleanupLab/AudioCleanupLab.tsx) gerencia as fases `idle → preparing → recording → processing`, renderiza badges, players e controles, e utiliza `appLogger` para rastrear cada transição.
- É possível reprocessar o último take com outro preset sem gravar de novo; basta trocar o preset enquanto o estado está `idle`, o que dispara `reprocessExistingCapture()` e envia o blob bruto novamente para `requestNoiseCleanup()`.
- O laboratório converte os headers retornados (`backend`, `processingTime`, ganhos de SNR) em status cards, exibindo sempre o pipeline ativo ou mensagens de indisponibilidade com fallback visual.

Clique em **Gravar amostra** para capturar o áudio bruto; assim que você para a gravação, o app faz upload automático para o preset escolhido e exibe players Original x Tratado, além dos diagnósticos retornados (tempo de processamento, ganho de SNR, backend utilizado). Utilize o laboratório antes de entrar no passo **Gravação** do fluxo principal para ajustar ganho do microfone, escolher ambientes silenciosos e confirmar que o backend de limpeza está entregando o padrão esperado.

> Para desenvolvimento local: (1) execute `npm run dev:cleanup` para subir o serviço em `http://localhost:3000`, (2) mantenha `VITE_API_URL=http://localhost:5173/api` e (3) defina `VITE_API_PROXY_TARGET=http://localhost:3000`. O Vite fará proxy de `/api` para o backend, evitando CORS e eliminando erros 404/500.

#### Servidor local de limpeza

- O script [server/audio-cleanup-server.ts](server/audio-cleanup-server.ts) usa `express`, `multer` e `fluent-ffmpeg` (com `ffmpeg-static`) para aplicar as cadeias `afftdn` descritas na [documentação oficial do FFmpeg](https://ffmpeg.org/ffmpeg-filters.html#afftdn) e retornar um WAV pronto para comparação no laboratório.
- O preset `arnndn-lq` baixa automaticamente o modelo público `lq.rnnn` do repositório [GregorR/rnnoise-models](https://github.com/GregorR/rnnoise-models); o arquivo fica em `server/models/lq.rnnn` e é ignorado pelo Git. Caso o download falhe, o servidor registra o motivo e faz fallback para `afftdn`.
- Ajuste `CLEANUP_PORT` e `ARNNDN_MODEL_URL` conforme necessário (`CLEANUP_PORT=4000 npm run dev:cleanup`) e mantenha `VITE_API_PROXY_TARGET` sincronizado para que o proxy do Vite envie as requisições ao porto correto.

### Audio Equalizer Lab

A rota `/audio-eq-lab` complementa a limpeza com um banco de três takes sequenciais. Cada take é gravado individualmente, e o laboratório gera duas versões concatenadas: a mix bruta e a mix equalizada com filtros `lowshelf`, `peaking` e `highshelf` baseados no Web Audio API `BiquadFilterNode`. Ajuste os sliders de ganho, clique em **Gerar mix** e compare imediatamente os resultados usando os players expostos no laboratório.

- [src/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab.tsx](src/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab.tsx) controla `TAKE_COUNT=3`, renderiza `TakeCard`s para cada captura e expõe `StatusChip`s para MediaRecorder, pipeline e contagem de takes.
- A função `mixRecordings()` decodifica cada blob (`decodeBlobToBuffer()`), converte para mono, garante sample rate de 48 kHz (`resampleBuffer()`), concatena e passa o áudio por um `OfflineAudioContext` para aplicar o EQ em blocos de até 60 s, sempre validando o buffer com `debugValidateBuffer()`.
- Helpers como `renderOfflineWithTimeout()` e `ensureBufferHasSignal()` impedem mixagens silenciosas e geram logs ricos (com `appLogger`) quando detectam NaN, falta de sinal ou filtros configurados fora do intervalo seguro.

## Estrutura de pastas

A organização continua orientada a features; módulos cross-feature vivem em `shared/` e cada rota importa diretamente o que precisa sem barrels globais.

```
src/
├── app/
│   ├── App.tsx                # Orquestra o fluxo da aplicação
│   └── providers.tsx          # Providers globais (error boundary, etc.)
├── config/
│   ├── constants/             # Constantes de domínio (vídeo, prompts)
│   └── env.ts                 # Helper type-safe para variáveis Vite
├── schemas/                   # Zod schemas (script, slide, refinamentos)
├── services/
│   └── openaiService.ts       # Integrações GPT-5.1 + GPT-image com retries
├── features/
│   ├── render-test/
│   │   ├── components/        # Página /render-test para validar bundles
│   │   └── model/             # Contratos (manifesto, slides) compartilhados
│   └── video-generation/
│       ├── api/               # Integrações com OpenAI (scripts, imagens)
│       ├── components/        # Input, Loading, Editor, Recording, Preview
│       ├── hooks/             # `useVideoGeneration` com todo o fluxo
│       └── model/             # Tipos coesos da feature
├── shared/
│   ├── components/            # Error boundaries reutilizáveis
│   ├── errors/                # Modelos de erro
│   ├── lib/                   # SDKs/configurações compartilhadas
│   ├── logging/               # Logger estruturado com emojis
│   └── utils/                 # Helpers (UUID, controle de concorrência)
└── vite-env.d.ts
```

Cada feature expõe apenas o que precisa através de seus próprios diretórios, evitando barrels globais. Código verdadeiramente compartilhado fica em `shared/`. Schemas e serviços OpenAI são centrais para reaproveitar validações/integrações.

## Destaques do código

- [src/features/video-generation/components/VideoGenerationFlow/VideoGenerationFlow.tsx](src/features/video-generation/components/VideoGenerationFlow/VideoGenerationFlow.tsx) e [src/features/video-generation/hooks/useVideoGeneration.ts](src/features/video-generation/hooks/useVideoGeneration.ts) compõem o stepper, coordenam `VIDEO_GENERATION_STEP`, acionam o CTA de laboratórios e delegam controle de concorrência para [src/shared/utils/concurrency.ts](src/shared/utils/concurrency.ts).
- [src/features/video-generation/api/videoGenerationApi.ts](src/features/video-generation/api/videoGenerationApi.ts) normaliza público-alvo, mistura duração estimada com o blueprint escolhido e injeta `styleGuide`/referências visuais antes de chamar o serviço de imagens.
- [src/services/openaiService.ts](src/services/openaiService.ts) centraliza as chamadas OpenAI (Responses API + GPT-image), define JSON Schemas rígidos, aplica `withRetry` e propaga erros customizados (`OpenAIServiceError`).
- [src/shared/hooks/useWebAVRenderer.ts](src/shared/hooks/useWebAVRenderer.ts) gerencia o ciclo completo de renderização com WebAV: criar sprites, combinar e exportar MP4 com aceleração GPU.
- [src/features/video-generation/components/PreviewStep/WebAVRenderer.tsx](src/features/video-generation/components/PreviewStep/WebAVRenderer.tsx) expõe UI de renderização WebAV com progresso em tempo real e detecção automática de capabilities do navegador.
- [src/features/audio-lab/components/AudioCleanupLab/AudioCleanupLab.tsx](src/features/audio-lab/components/AudioCleanupLab/AudioCleanupLab.tsx) conversa com [server/audio-cleanup-server.ts](server/audio-cleanup-server.ts) para gerenciar presets, diagnósticos e reprocessamentos com abort controller e logs estruturados.
- [src/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab.tsx](src/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab.tsx) implementa um pipeline completo com `OfflineAudioContext`, chunking de 60 s, validação de buffers e export para WAV para cada mix.
- [src/features/render-test/components/RenderTestPage/RenderTestPage.tsx](src/features/render-test/components/RenderTestPage/RenderTestPage.tsx) usa JSZip para inspecionar bundles, gera `objectURL` para cada asset e garante limpeza com `cleanupPreviewAssets()` ao trocar de arquivo.
- [src/shared/logging/logger.ts](src/shared/logging/logger.ts) e [src/shared/hooks/useDebugMode.ts](src/shared/hooks/useDebugMode.ts) mantêm logging estruturado com emojis e sincronizam o modo debug entre query string, hash, `localStorage` e `window.__EDUSCRIPT_DEBUG__`.

## Variáveis de ambiente

Use o template [.env.example](.env.example) como base:

```bash
cp .env.example .env
```

Valores disponíveis:

| Variável                | Obrigatório      | Observação                                                                   |
| ----------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `VITE_OPENAI_API_KEY`   | Desenvolvimento  | Exposta no bundle; use apenas para testes locais.                            |
| `OPENAI_API_KEY`        | Produção/backend | Injete via proxy/edge function para esconder a chave real.                   |
| `VITE_APP_TITLE`        | Não              | Atualiza o título da aba.                                                    |
| `VITE_API_URL`          | Não              | Base das requisições do app (ex.: `http://localhost:5173/api`).              |
| `VITE_API_PROXY_TARGET` | Não              | Host do serviço Node (ex.: `http://localhost:3000`) usado pelo proxy `/api`. |
| `VITE_PORT`             | Não              | Porta do dev server.                                                         |

> ⚠️ Em produção, mantenha somente `OPENAI_API_KEY` no servidor e encaminhe chamadas via proxy para evitar vazamento da chave.

## Schemas & serviço OpenAI

- [src/schemas/eduScriptSchemas.ts](src/schemas/eduScriptSchemas.ts) concentra os modelos Zod de slides, scripts e refinamentos. Isso garante que o contrato usado pelo LangChain/Responses API seja o mesmo consumido no app.
- [src/services/openaiService.ts](src/services/openaiService.ts) orquestra GPT-5.1-Codex-Max para texto e GPT-image-1.5 para imagens, inclui `withRetry`, tratamento de erros estruturado e helpers como `refineSlideContentWithFeedback`.
- [src/examples/usageExample.ts](src/examples/usageExample.ts) demonstra o fluxo completo (`generateScriptFromMaterials`, `generateSlideImages`, `refineContent`) pronto para CLI/tests.

Exemplo rápido do serviço:

```ts
import {
  generateScriptFromMaterials,
  withRetry,
} from '@/services/openaiService';

const script = await withRetry(() =>
  generateScriptFromMaterials(materials, {
    topic: 'Ciclo da água',
    targetAudience: 'middleSchool',
    desiredDuration: 5,
  }),
);
```

## Catálogo de prompts & pesquisas

- Os blueprints de prompts derivados de `docs/prompts` agora vivem tipados em [src/content/prompts](src/content/prompts).
- Cada blueprint carrega metadados (categoria, range de slides, duração, tom) e expõe helpers (`getPromptBlueprintById`, `loadPromptMarkdown`).
- O `InputStep` usa esses dados para permitir que o usuário escolha a finalidade do vídeo antes da geração e o fluxo inteiro respeita a duração/estilo escolhidos.
- Para carregar o markdown bruto dos estudos de deep research, use `loadBlueprintMarkdown(promptId)` — o Vite importa o `.md` como string via `import.meta.glob`.

## Scripts principais

| Comando            | Ação                                                      |
| ------------------ | --------------------------------------------------------- |
| `yarn install`     | Instala dependências                                      |
| `yarn dev`         | Inicia Vite com React Fast Refresh                        |
| `yarn dev:cleanup` | Inicia o backend local `/audio/cleanup` com fluent-ffmpeg |
| `yarn build`       | `tsc --noEmit` + `vite build`                             |
| `yarn preview`     | Pré-visualiza o build                                     |
| `yarn lint`        | ESLint 9 (flat) com React + TS + a11y                     |
| `yarn typecheck`   | Garante que o TS está saudável                            |
| `yarn format`      | Prettier com `printWidth: 80`, `singleQuote: true`        |

## Fluxo de geração

O estado global vive em [src/features/video-generation/hooks/useVideoGeneration.ts](src/features/video-generation/hooks/useVideoGeneration.ts), que normaliza IDs com `uuidv4()`, controla `VIDEO_GENERATION_STEP`, publica progresso para o UI e orquestra as transições disparadas pelos componentes. A geração em lote respeita `VIDEO_CONFIG.IMAGE_GENERATION_CONCURRENCY_LIMIT` ao delegar trabalho para [src/shared/utils/concurrency.ts](src/shared/utils/concurrency.ts), enquanto `appLogger` acompanha cada ação.

1. **Briefing (`InputStep`)** — formulário com `useActionState` valida os campos e dispara `useVideoGeneration().actions.startGeneration`.
2. **Roteiro** — `generateScriptFromMaterials` usa GPT-5.1-Codex-Max (via LangChain) com schemas Zod para garantir JSON válido.
3. **Visuais** — `runWithConcurrency` limita a geração de imagens (`gpt-image-1.5`) ao valor em `VIDEO_CONFIG.IMAGE_GENERATION_CONCURRENCY_LIMIT`, enquanto `generateSlideImage()` em [src/features/video-generation/api/videoGenerationApi.ts](src/features/video-generation/api/videoGenerationApi.ts) aplica prompt visual, aspect ratio e referências do `styleGuide` de cada slide.
4. **Edição** — usuário pode ajustar o texto manualmente ou enviar feedback para `refineSlideContent`.
5. **Gravação** — `MediaRecorder` captura o áudio por slide e o fluxo garante limpeza dos streams.
6. **Preview & Export** — preview sincronizado com áudio e export via **WebAV** (aceleração GPU, 20x mais rápido) ou fallback com `MediaRecorder`. Implementamos detecção de capabilities com `detectWebCodecsCapabilities()` e mantemos ambas as opções de renderização. Em modo debug é possível exportar um bundle `.zip` contendo roteiro, imagens e áudios para inspeção offline.

Falhas em cada etapa são isoladas com `react-error-boundary`: `AppProviders` cobre a árvore inteira e `SectionErrorFallback` envolve Editor/Recording/Preview individualmente.

## Modo debug & render-test

- Ative o modo debug com `?debug=true` (ou definindo `localStorage.setItem('eduscript:debug-mode','true')`). O novo hook [useDebugMode](src/shared/hooks/useDebugMode.ts) mantém o flag sincronizado entre query string, hash, `localStorage` e window globals.
- Quando o modo estiver ativo, o `PreviewStep` exibe o botão **Bundle debug**, que gera um `.zip` contendo `manifest.json`, imagens e áudios por slide usando JSZip. Esse pacote permite validar a renderização final sem reprocessar os materiais.
- A rota `/render-test` carrega a página [RenderTestPage](src/features/render-test/components/RenderTestPage/RenderTestPage.tsx): basta arrastar o bundle `.zip` (ou apenas o `manifest.json`) para ver cada slide, ouvir o áudio, conferir prompts e métricas antes de enviar para o renderizador definitivo.
- O modelo do manifesto fica em [renderBundle.ts](src/features/render-test/model/renderBundle.ts) e é compartilhado entre exportação e leitura, evitando incompatibilidades entre ambientes.

## Logging e diagnósticos

Use `appLogger.info|warn|error`, exposto em [src/shared/logging/logger.ts](src/shared/logging/logger.ts), para qualquer análise. Os logs já carregam emojis e contexto serializado, facilitando filtros no console ou em observabilidade externa.

## Checklist para contribuições

- Siga os padrões de nomenclatura (PascalCase para componentes, `use` prefix para hooks, `is/has/should` para booleanos, etc.).
- Evite novos barrel files — importe direto dos módulos.
- Coloque código reutilizável em `shared/` somente quando for realmente cross-feature.
- Sempre rode `yarn typecheck && yarn lint` antes de abrir PR.
- Se adicionar novas integrações com APIs externas, centralize em `features/<feature>/api` e exponha helpers via hooks.

## Roadmap

- [ ] Adicionar biblioteca de prompts reutilizáveis (`features/content-library`).
- [ ] Salvar projetos no Azure Cosmos DB para colaborar em tempo real (seguir instruções anexas).
- [ ] Criar suítes de testes e2e com Playwright cobrindo as etapas do fluxo.

Sinta-se à vontade para abrir issues ou PRs com melhorias no fluxo ou novas features de vídeo educacional. 💡
