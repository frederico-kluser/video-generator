<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EduScript AI — React 19 + Vite 6 + TypeScript 5.8

Video generator otimizado para 2025 com arquitetura feature-based, React 19 e integrações com OpenAI (GPT-5.1-Codex-Max + GPT-image-1.5). O projeto segue as referências do Bulletproof React, Feature-Sliced Design e recomendações de especialistas como Matt Pocock.

## Stack & ferramentas

- Pipeline RNNoise WASM + filtros nativos exposto no `/audio-lab` para pré-checar ruído (execute `yarn install` após atualizar para baixar `@timephy/rnnoise-wasm`)

## Experiência visual 2025

- O tema "Aurora Lab" fica aplicado por padrão em todo o app, definindo os tokens de cor via CSS variables para manter a identidade visual.

## Estrutura de pastas

Acesse `/audio-lab` para abrir o laboratório de limpeza. A página roda em cima do `@timephy/rnnoise-wasm` (baixado via `yarn install`) e de uma cadeia Web Audio (high-pass → compressor → limiter) antes de gravar com `MediaRecorder`.
Clique em **Gravar amostra** para capturar simultaneamente o áudio bruto e o áudio tratado; em seguida, use os dois players (Original x Tratado) para comparar ruído de fundo, respirações e nível geral.
O badge “Pipeline” indica se o RNNoise carregou. Caso o navegador não suporte `AudioWorklet`, o app mostra “Fallback nativo” e ainda aplica os filtros que não dependem de WASM.
Utilize o laboratório antes de entrar no passo **Gravação** do fluxo principal para ajustar ganho do microfone, escolher ambientes silenciosos e validar que a limpeza atenderá ao padrão do vídeo final.

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

## Variáveis de ambiente

Use o template [.env.example](.env.example) como base:

```bash
cp .env.example .env
```

Valores disponíveis:

| Variável              | Obrigatório      | Observação                                                 |
| --------------------- | ---------------- | ---------------------------------------------------------- |
| `VITE_OPENAI_API_KEY` | Desenvolvimento  | Exposta no bundle; use apenas para testes locais.          |
| `OPENAI_API_KEY`      | Produção/backend | Injete via proxy/edge function para esconder a chave real. |
| `VITE_APP_TITLE`      | Não              | Atualiza o título da aba.                                  |
| `VITE_API_URL`        | Não              | Endpoint para futuros backends.                            |
| `VITE_PORT`           | Não              | Porta do dev server.                                       |

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

| Comando          | Ação                                               |
| ---------------- | -------------------------------------------------- |
| `yarn install`   | Instala dependências                               |
| `yarn dev`       | Inicia Vite com React Fast Refresh                 |
| `yarn build`     | `tsc --noEmit` + `vite build`                      |
| `yarn preview`   | Pré-visualiza o build                              |
| `yarn lint`      | ESLint 9 (flat) com React + TS + a11y              |
| `yarn typecheck` | Garante que o TS está saudável                     |
| `yarn format`    | Prettier com `printWidth: 80`, `singleQuote: true` |

## Fluxo de geração

1. **Briefing (`InputStep`)** — formulário com `useActionState` valida os campos e dispara `useVideoGeneration().actions.startGeneration`.
2. **Roteiro** — `generateScriptFromMaterials` usa GPT-5.1-Codex-Max (via LangChain) com schemas Zod para garantir JSON válido.
3. **Visuais** — `runWithConcurrency` limita a geração de imagens (`gpt-image-1.5`) ao valor em `VIDEO_CONFIG.IMAGE_GENERATION_CONCURRENCY_LIMIT`.
4. **Edição** — usuário pode ajustar o texto manualmente ou enviar feedback para `refineSlideContent`.
5. **Gravação** — `MediaRecorder` captura o áudio por slide e o fluxo garante limpeza dos streams.
6. **Preview & Export** — preview sincronizado com áudio e export via `MediaRecorder`. Implementamos fallback para criação de canvas (DOM e Offscreen) e checagens extras de compatibilidade. Em modo debug é possível exportar um bundle `.zip` contendo roteiro, imagens e áudios para inspeção offline.

Falhas em cada etapa são isoladas com `react-error-boundary`: `AppProviders` cobre a árvore inteira e `SectionErrorFallback` envolve Editor/Recording/Preview individualmente.

## Modo debug & render-test

- Ative o modo debug com `?debug=true` (ou definindo `localStorage.setItem('eduscript:debug-mode','true')`). O novo hook [useDebugMode](src/shared/hooks/useDebugMode.ts) mantém o flag sincronizado entre query string, hash, `localStorage` e window globals.
- Quando o modo estiver ativo, o `PreviewStep` exibe o botão **Bundle debug**, que gera um `.zip` contendo `manifest.json`, imagens e áudios por slide usando JSZip. Esse pacote permite validar a renderização final sem reprocessar os materiais.
- A rota `/render-test` carrega a página [RenderTestPage](src/features/render-test/components/RenderTestPage/RenderTestPage.tsx): basta arrastar o bundle `.zip` (ou apenas o `manifest.json`) para ver cada slide, ouvir o áudio, conferir prompts e métricas antes de enviar para o renderizador definitivo.
- O modelo do manifesto fica em [renderBundle.ts](src/features/render-test/model/renderBundle.ts) e é compartilhado entre exportação e leitura, evitando incompatibilidades entre ambientes.

## Logging e diagnósticos

Use `appLogger.info|warn|error` para qualquer análise. Os logs já carregam emojis e contexto serializado, facilitando filtros no console ou em observabilidade externa.

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
