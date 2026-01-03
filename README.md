<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Grava — React 19 + Vite 6 + TypeScript 5.8
> Gerador de vídeos educativos pensado para 2025 com arquitetura orientada a features, WebAV para renderização acelerada via WebCodecs e integrações com GPT-5.1-Codex-Max (roteiros) + GPT-image-1.5 (visuais).

## Sumário
- [Visão geral rápida](#visão-geral-rápida)
- [Rotas e módulos principais](#rotas-e-módulos-principais)
- [Primeiros passos](#primeiros-passos)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts Yarn](#scripts-yarn)
- [Arquitetura e convenções](#arquitetura-e-convenções)
- [Fluxo de geração de vídeo](#fluxo-de-gera%C3%A7%C3%A3o-de-v%C3%ADdeo)
- [Laboratórios de áudio](#laboratórios-de-áudio)
- [Renderização e testes de bundle](#renderiza%C3%A7%C3%A3o-e-testes-de-bundle)
- [Logging, debug e observabilidade](#logging-debug-e-observabilidade)
- [Documentação complementar](#documenta%C3%A7%C3%A3o-complementar)
- [Roadmap](#roadmap)

## Visão geral rápida
Grava combina briefing guiado, geração assistida por IA, narração humana e renderização acelerada em um único fluxo React 19 + Vite 6. A UI segue o tema “Aurora Lab” e aplica tokens globais via CSS variables. Toda a lógica crítica foi separada em features independentes para facilitar manutenção e experimentação.

### Destaques do produto
- **Fluxo fim a fim**: briefing → roteiro → revisão → visuais → edição → gravação → preview/export.
- **WebAV integrado**: exporta vídeos 20x mais rápido que FFmpeg.wasm com apenas ~50KB de payload.
- **Laboratórios de áudio**: `/audio-lab` limpa ruídos com pipelines server-side e `/audio-eq-lab` equaliza e concatena takes.
- **Render test**: `/render-test` valida bundles `.zip` ou `manifest.json` com o mesmo renderer do preview.
- **Observabilidade**: `appLogger` adiciona contexto estruturado com emojis em cada etapa.
- **Animações 3Blue1Brown**: o Editor gera clipes Manim CE (6–12s) via API local compatível com o pipeline oficial da 3Blue1Brown, anexando o MP4 diretamente como asset do slide.

### Stack e integrações
React 19, TypeScript 5.8, Vite 6, Tailwind 3.4, WebAV (`@webav/av-*`), LangChain + OpenAI SDK, Express + `fluent-ffmpeg`, FastAPI + Manim CE (API externa 3Blue1Brown), Zod, JSZip, Lucide React.

## Rotas e módulos principais

| Rota            | Componente principal                                                                                        | Propósito                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/`             | [VideoGenerationFlow](src/features/video-generation/components/VideoGenerationFlow/VideoGenerationFlow.tsx) | Stepper completo de briefing a exportação                                 |
| `/audio-lab`    | [AudioCleanupLab](src/features/audio-lab/components/AudioCleanupLab/AudioCleanupLab.tsx)                    | Compara áudio bruto vs pipelines de limpeza server-side                   |
| `/audio-eq-lab` | [AudioEqualizerLab](src/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab.tsx)           | Equaliza três takes sequenciais com Web Audio API                         |
| `/render-test`  | [RenderTestPage](src/features/render-test/components/RenderTestPage/RenderTestPage.tsx)                     | Valida bundles exportados, inspeciona assets e renderiza com WebAV        |

O roteador vive em [src/app/App.tsx](src/app/App.tsx) e seleciona a feature conforme `window.location.pathname`. A CTA [AudioLabsCta](src/shared/components/AudioLabsCta/AudioLabsCta.tsx) facilita a navegação entre os laboratórios quando o modo debug está ativo.

## Primeiros passos

### Pré-requisitos
- Node.js 20+ (testado com 20.11).
- Yarn 1.22.x (o projeto define `packageManager`).
- Navegador compatível com WebCodecs (Chrome/Edge 102+, Safari 16.6+ com limitações).
- Opcional: microfone para testar gravações e um backend com FFmpeg se quiser experimentar o `/audio-lab`.

### Setup
1. Instale dependências:  
   ```bash
   yarn install
   ```
2. Copie as variáveis padrão:  
   ```bash
   cp .env.example .env
   ```
3. Preencha `VITE_OPENAI_API_KEY` (uso local) e `OPENAI_API_KEY` (para chamadas server-side/proxy). Em produção real, exponha somente o backend.

### Execução
- **Frontend + servidor de limpeza**: `yarn dev` usa `concurrently` para subir Vite (`yarn dev:client`) e o serviço Express (`yarn dev:cleanup`).  
- **Somente Vite**: `yarn dev:client`. Ideal para iterar no fluxo principal sem o backend.  
- **Somente backend de áudio**: `yarn dev:cleanup` (ajuste `CLEANUP_PORT` se necessário).  
- Configure `VITE_API_PROXY_TARGET=http://localhost:<porta-do-backend>` para permitir que o proxy `/api` do Vite encaminhe uploads sem CORS.

### Build, lint e testes
- `yarn typecheck` — garante saúde do TypeScript.
- `yarn lint` — ESLint 9 (flat config) com React, Hooks, A11y e `simple-import-sort`.
- `yarn build` — `tsc --noEmit` + `vite build`.
- `yarn preview` — serve o build com os headers de Cross-Origin Isolation já configurados.

## Variáveis de ambiente
Use [.env.example](.env.example) como base.

| Variável                | Obrigatório      | Observação                                                                   |
| ----------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `VITE_OPENAI_API_KEY`   | Desenvolvimento  | Vai para o bundle; use apenas em máquinas locais.                            |
| `OPENAI_API_KEY`        | Produção/backend | Injete no proxy/edge para esconder a chave real.                             |
| `VITE_APP_TITLE`        | Não              | Atualiza o título da aba (default: “Grava”).                                 |
| `VITE_API_URL`          | Não              | Base das requisições do app (ex.: `http://localhost:5173/api`).              |
| `VITE_API_PROXY_TARGET` | Não              | Host do backend Express (ex.: `http://localhost:3000`).                      |
| `VITE_PORT`             | Não              | Porta do servidor Vite.                                                      |
| `VITE_MANIM_API_BASE_URL` | Não           | Endpoint da API FastAPI que renderiza cenas Manim (default `http://localhost:8000`). |
| `CLEANUP_PORT`          | Backend          | Porta do serviço `/audio/cleanup`.                                           |
| `ARNNDN_MODEL_URL`      | Backend          | URL opcional para baixar o modelo `lq.rnnn`.                                 |

> ⚠️ Em produção, exponha apenas `OPENAI_API_KEY` no servidor e use o proxy para encaminhar chamadas. Os headers `Cross-Origin-Embedder-Policy` e `Cross-Origin-Opener-Policy` já estão configurados em `vite.config.ts`.

## Scripts Yarn

| Comando            | Ação                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `yarn dev`         | Vite + serviço de limpeza (concurrently)                             |
| `yarn dev:client`  | Apenas Vite                                                          |
| `yarn dev:cleanup` | Servidor Express com `multer` + `fluent-ffmpeg`                      |
| `yarn build`       | `tsc --noEmit` + `vite build`                                        |
| `yarn preview`     | Preview do build com headers COOP/COEP                               |
| `yarn lint`        | ESLint 9 + React + A11y + import-sort                                |
| `yarn typecheck`   | TypeScript estrito (`noUncheckedIndexedAccess`, etc.)                |
| `yarn format`      | Prettier (`printWidth: 80`, `singleQuote: true`)                     |

## Arquitetura e convenções
O código segue uma arquitetura orientada a features com referências do Bulletproof React e Feature-Sliced Design. Cada rota vive dentro de `src/features/<feature>` e consome apenas módulos necessários de `shared/`.

### Mapa de pastas
```
src/
├── app/                    # Orquestra roteamento e providers
├── config/                 # Constantes de domínio e helpers de env
├── content/                # Catálogo de prompts e estudos (markdown)
├── examples/               # Exemplos de uso do serviço OpenAI
├── features/
│   ├── audio-lab/          # Laboratório de limpeza de áudio
│   ├── audio-eq-lab/       # Equalizador de três takes
│   ├── render-test/        # Validador de bundles
│   └── video-generation/   # Fluxo principal do app
├── schemas/                # Zod schemas compartilhados
├── services/               # Integradores (OpenAI, etc.)
├── shared/                 # Componentes, libs, hooks, logging e utilitários
└── types/                  # Tipagens extras (WebAV, etc.)
```

### Convenções principais
- Importações usam o alias `@/*` (configurado em `tsconfig.json` e `vite.config.ts` via `vite-tsconfig-paths`).
- Componentes em PascalCase, hooks prefixados com `use`, booleans com `is/has/should`.
- Evite barrels globais; importe diretamente do módulo.
- `appLogger` centraliza logs e deve ser preferido no lugar de `console`.
- Cada seção crítica está protegida por `react-error-boundary` (`SectionErrorFallback`).
- Debug mode sincroniza query string, hash e `localStorage` através de [useDebugMode](src/shared/hooks/useDebugMode.ts).

## Fluxo de geração de vídeo

### Stepper e estado compartilhado
[useVideoGeneration](src/features/video-generation/hooks/useVideoGeneration.ts) mantém `VideoGenerationState`, controla o stepper (`VIDEO_GENERATION_STEP`) e executa ações atômicas: geração de roteiro, edição em massa, inserção/exclusão/ordenação de slides, criação de assets e abertura do preview.

### Briefing & prompts
[InputStep](src/features/video-generation/components/InputStep/InputStep.tsx) coleta tema, materiais, público e blueprint de prompt. Os blueprints vivem em [src/content/prompts](src/content/prompts) com metadados tipados e helpers (`getPromptBlueprintById`, `loadPromptMarkdown`).

### Geração de roteiro + validação
`generateScriptFromMaterials` (OpenAI Responses API via [src/services/openaiService.ts](src/services/openaiService.ts)) usa schemas JSON + Zod para garantir slides válidos. `applyScriptInstructionsToSlides` aplica diffs inteligentes quando o usuário fornece instruções adicionais na revisão.

### Revisão & assets personalizados
[ScriptReviewStep](src/features/video-generation/components/ScriptReviewStep/ScriptReviewStep.tsx) ordena slides, permite inserir/remover/mover, aceita notas de estilo e faz upload de referências visuais (até 5 por slide). Também é aqui que usuários adicionam **assets personalizados** (imagens ou vídeos) — cada upload gera um `customAsset` com preview/arquivo/duração opcional, bloqueando uploads de referências para evitar conflitos.

### Editor e ajustes guiados
[EditorStep](src/features/video-generation/components/EditorStep/EditorStep.tsx) permite feedback textual/voz (`VoiceInputButton`) por slide. Cada feedback chama `refineSlideContent`, marca o slide como `isRegeneratingImage` e dispara `generateSlideImage` com o novo prompt.

### Animações 3Blue1Brown (Manim)
O Editor também possui o cartão “Animação 3Blue1Brown”. Ao clicar em **Gerar animação**, o app envia o briefing do slide, notas e prompt visual para a API FastAPI/Manim definida em `VITE_MANIM_API_BASE_URL` (default `http://localhost:8000`). A resposta (`/generate-video`) deve seguir o contrato do [manim-api](https://github.com/) usado pelo time: sucesso com `video_base64` + `scene_name`.

Resumo do fluxo: 
1. `generateManimSlideAnimation` monta um prompt especializado com o preâmbulo do estúdio (paleta BLUE_E/TEAL_E/GOLD_E, duração 6–12s, câmera suave, `self.wait(1)`).
2. O MP4 retornado é transformado em `File` + `blob:` URL, tem a duração lida via `readVideoDurationMs` e entra como `SlideCustomAsset` do tipo `video`.
3. O asset substitui a imagem do slide em todas as etapas (Editor, Recording, Preview/WebAV bundles). O fallback por `MediaRecorder` fica automaticamente bloqueado, já que há vídeo customizado.

> Para subir a API local, clone o repositório `3blue1brown/manim-api`, rode `./setup_all.sh` (macOS/Linux), ative `venv` e execute `uvicorn main:app --reload --host 0.0.0.0 --port 8000`. O app detecta a URL via `VITE_MANIM_API_BASE_URL`.

### Estúdio de narração
[RecordingStep](src/features/video-generation/components/RecordingStep/RecordingStep.tsx) usa `MediaRecorder` para capturar áudio por slide, marca progresso, oferece regravação e pré-escuta, além de exibir o visual (imagem ou vídeo customizado) para manter contexto.

### Preview, debug e export
[PreviewStep](src/features/video-generation/components/PreviewStep/PreviewStep.tsx) sincroniza áudio/visuais, gera bundles `.zip` quando o modo debug está ativo e oferece dois caminhos de exportação:
- **WebAV Renderer** ([WebAVRenderer.tsx](src/features/video-generation/components/PreviewStep/WebAVRenderer.tsx) + [useWebAVRenderer](src/shared/hooks/useWebAVRenderer.ts)) — GPU, suporta vídeos customizados e gera MP4.
- **Fallback MediaRecorder** — apenas imagens + áudio, útil para navegadores sem WebCodecs. Fica automaticamente desabilitado quando há vídeos enviados.

### Estado atual da adição de vídeos
- Cada slide aceita **um** asset personalizado (`SlideCustomAsset`) que pode ser imagem, vídeo enviado manualmente ou o MP4 gerado automaticamente via 3Blue1Brown/Manim.
- Uploads continuam disponíveis na Revisão (imagem/vídeo). No Editor, o botão “Gerar animação” substitui o asset atual se a API retornar sucesso.
- Vídeos aparecem no Editor, Gravação e Preview como loops silenciosos; o áudio oficial continua vindo da narração gravada. A duração tentada é lida via `video.onloadedmetadata` e reaproveitada no WebAV (que congela o último frame se o áudio for mais longo).
- O exportador WebAV incorpora o arquivo real (blob ou URL) e também o adiciona no bundle de debug; o fallback via MediaRecorder é automaticamente bloqueado quando `hasVideoAssets === true`.
- Limitações atuais: sem recorte/trimming, sem ajustes de volume, sem normalização de aspect ratio (o vídeo é encaixado via `object-fit: cover`) e sem upload para storage/server — recarregar a página perde o asset. Essas evoluções estão listadas no roadmap.

## Laboratórios de áudio

### Audio Cleanup Lab (`/audio-lab`)
Componente: [AudioCleanupLab](src/features/audio-lab/components/AudioCleanupLab/AudioCleanupLab.tsx). Fluxo `idle → preparing → recording → processing`, comparação lado a lado e diagnósticos (headers `X-Cleanup-Backend`, `X-Processing-Time-Ms`, `X-SNR-Improvement-Db`). É possível reprocessar o último take mudando apenas o preset, sem nova gravação.

### Audio Equalizer Lab (`/audio-eq-lab`)
Componente: [AudioEqualizerLab](src/features/audio-eq-lab/components/AudioEqualizerLab/AudioEqualizerLab.tsx). Grava três takes, converte tudo para 48 kHz mono, concatena e aplica filtros `lowshelf`, `peaking` e `highshelf` usando `OfflineAudioContext`. Helpers como `renderOfflineWithTimeout` e `ensureBufferHasSignal` evitam mixagens silenciosas.

### Servidor local de limpeza
[server/audio-cleanup-server.ts](server/audio-cleanup-server.ts) expõe:
- `GET /health`
- `POST /audio/cleanup` (multipart `audio`, campo `preset` opcional: `sherpa-onnx`, `arnndn-lq`, `deepfilternet`)

O servidor usa `ffmpeg-static`, baixa `lq.rnnn` automaticamente para o preset ARNNDN e aplica filtros (`afftdn`, `arnndn`, `deepfilternet`). Headers CORS já configurados. Rode com:
```bash
CLEANUP_PORT=3000 yarn dev:cleanup
```
Aponte `VITE_API_PROXY_TARGET` para esse host para que o Vite faça proxy de `/api`.

## Renderização e testes de bundle

### WebAV renderer
A integração descrita em [docs/WEBAV_INTEGRATION.md](docs/WEBAV_INTEGRATION.md) e [docs/RENDER_VIDEO.md](docs/RENDER_VIDEO.md) explica como configuramos COOP/COEP, chunks manuais, detecção de capabilities e fallback para freeze frame quando o vídeo customizado termina antes do áudio.

### /render-test
[RenderTestPage](src/features/render-test/components/RenderTestPage/RenderTestPage.tsx) aceita um bundle `.zip` ou `manifest.json` exportado do Preview. Ele reconstrói slides, toca áudios, mostra prompts e reutiliza `WebAVRenderer` para renderizar o MP4 final, garantindo paridade entre ambientes offline e o app principal.

## Logging, debug e observabilidade
- `appLogger` ([src/shared/logging/logger.ts](src/shared/logging/logger.ts)) expõe `info/warn/error` com contexto serializado e emojis por domínio.
- `useDebugMode` sincroniza o modo debug via query `?debug=true`, hash, `localStorage` e `window.__EDUSCRIPT_DEBUG__`.
- Componentes críticos (Editor, Recording, Preview) ficam dentro de `ErrorBoundary` customizados (`SectionErrorFallback`) para isolar falhas sem derrubar o app inteiro.

## Documentação complementar
- [docs/WEBAV_INTEGRATION.md](docs/WEBAV_INTEGRATION.md) — checklist completo de WebAV + WebCodecs.
- [docs/RENDER_VIDEO.md](docs/RENDER_VIDEO.md) — guia aprofundado de clips, sprites, combinator e edição no navegador.
- [docs/TOOLS_VIDEO_EDITION.md](docs/TOOLS_VIDEO_EDITION.md) — benchmarking de SDKs e trade-offs.
- [docs/PROMPT_AUDIT.md](docs/PROMPT_AUDIT.md) — histórico e auditoria dos blueprints de prompt.
- [docs/NEXT_PROMPT_PLAN.md](docs/NEXT_PROMPT_PLAN.md) — melhorias planejadas para prompts.
- [docs/ai-agent-prompts](docs/ai-agent-prompts) / [docs/prompts](docs/prompts) — repositório bruto de estudos e pesquisas para IA.
- [docs/MTL_XML.md](docs/MTL_XML.md) — referência de parsing/renderização de materiais 3D (para futuras integrações).

## Roadmap
- [ ] Adicionar biblioteca de prompts reutilizáveis (`features/content-library`).
- [ ] Salvar projetos (slides, áudio, assets customizados) em Azure Cosmos DB para colaboração em tempo real.
- [ ] Criar suítes de testes e2e com Playwright cobrindo o fluxo completo.
- [ ] Persistir uploads de vídeo/imagem em storage durável + CDN com assinaturas temporárias.
- [ ] Habilitar edição (trim/volume) e suporte ao export fallback para vídeos personalizados.

Sinta-se à vontade para abrir issues ou PRs com melhorias no fluxo ou novas features de vídeo educacional. 💡
