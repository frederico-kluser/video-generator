<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EduScript AI — React 19 + Vite 6 + TypeScript 5.8

Video generator otimizado para 2025 com arquitetura feature-based, React 19 e integrações com OpenAI (GPT-5.1-Codex-Max + GPT-image-1.5). O projeto segue as referências do Bulletproof React, Feature-Sliced Design e recomendações de especialistas como Matt Pocock.

## Stack & ferramentas

- React 19 em modo estrito com novos hooks (`useActionState` e cia.)
- Vite 6 com `vite-tsconfig-paths` e build otimizado (chunks vendor/AI)
- TypeScript 5.8 em modo estrito e aliases `@/`
- ESLint 9 (flat config) + `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-simple-import-sort`
- Prettier 3 (execução separada, apenas `eslint-config-prettier` no lint)
- `react-error-boundary` para isolarmos falhas por sessão da UI
- `react-error-boundary` + logger estruturado com emojis para debugar rapidamente
- OpenAI SDK 4 + LangChain para outputs estruturados via Zod (`schemas/eduScriptSchemas.ts`) e serviço dedicado em `services/openaiService.ts`

## Experiência visual 2025

- Paleta roxo/violeta com degradês animados, glow e glassmorphism aplicada globalmente em [src/index.css](src/index.css).
- Cards, botões e badges reutilizam utilitários (`glass-card`, `btn-primary`, `badge-primary`) para manter consistência em toda a feature.
- Partículas e discos de luz são renderizados no topo da árvore em [src/app/App.tsx](src/app/App.tsx) para dar profundidade sem acoplar os componentes.
- Componentes de etapa (Input, Loading, Editor, Recording, Preview) recebem animações utilitárias (`animate-slide-up`, `animate-shimmer`) definidas no Tailwind config.
- Scrollbar customizada e tipografia Inter já inclusas para manter o novo branding dentro e fora do app shell.
- Cada componente crítico está protegido por `ErrorBoundary`, permitindo que efeitos visuais não comprometam a resiliência.
- O seletor de temas flutuante (Midnight, Aurora, Solstice) controla tokens de cor em tempo real via CSS variables e pode ser ajustado em qualquer etapa do fluxo.

## Estrutura de pastas

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
6. **Preview & Export** — preview sincronizado com áudio e export via `MediaRecorder`. Implementamos fallback para criação de canvas (DOM e Offscreen) e checagens extras de compatibilidade.

Falhas em cada etapa são isoladas com `react-error-boundary`: `AppProviders` cobre a árvore inteira e `SectionErrorFallback` envolve Editor/Recording/Preview individualmente.

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
