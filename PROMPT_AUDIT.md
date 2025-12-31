# Guia de Auditoria — Prompts e Lógica de Geração

## Objetivo

Este documento descreve todas as instruções que entregamos aos modelos OpenAI para gerar roteiros, imagens e ajustes finos dos slides. A meta é oferecer visibilidade ao time de auditoria para que possam revisar, corrigir e evoluir nossos prompts e heurísticas.

## Fluxo Macro

1. **Briefing do usuário** → coletamos tópico, materiais, público e aspecto do vídeo.
2. **Roteiro estruturado** → `generateScriptFromMaterials` cria slides completos via LangChain + Zod garantindo JSON válido ([src/services/openaiService.ts#L138-L195](src/services/openaiService.ts#L138-L195)).
3. **Normalização local** → convertemos o script em slides internos, estimamos duração e escolhemos prompts visuais ([src/features/video-generation/api/videoGenerationApi.ts#L14-L120](src/features/video-generation/api/videoGenerationApi.ts#L14-L120)).
4. **Geração visual** → chamamos GPT-Image 1.5 com instruções sobre estilo e público ([src/services/openaiService.ts#L240-L308](src/services/openaiService.ts#L240-L308)).
5. **Refinamentos** (opcional) → usuário envia feedback e/ou pede reescritas direcionadas ([src/services/openaiService.ts#L354-L491](src/services/openaiService.ts#L354-L491)).

## Inventário de Prompts

### 1. Script Pedagógico Principal

- **System prompt**: especialista em conteúdo educacional que precisa criar roteiros coesos, com notas do apresentador e progressão lógica ([src/services/openaiService.ts#L147-L172](src/services/openaiService.ts#L147-L172)).
- **User prompt**: injeta tópico, público, duração desejada e materiais. Também exige contagem mínima/máxima de slides e marcação de locais com imagens ([src/services/openaiService.ts#L156-L172](src/services/openaiService.ts#L156-L172)).
- **Structured output**: usamos `withStructuredOutput(ScriptSchema)` com modo estrito para garantir aderência ao contrato ([src/services/openaiService.ts#L174-L193](src/services/openaiService.ts#L174-L193) e [src/schemas/eduScriptSchemas.ts#L47-L92](src/schemas/eduScriptSchemas.ts#L47-L92)).

### 2. Fallback Responses API

- Mesmo objetivo do item anterior, porém via `openai.responses` usando o modelo `gpt-5.1-codex-max` e o JSON schema manual `scriptJsonSchema` ([src/services/openaiService.ts#L199-L235](src/services/openaiService.ts#L199-L235)).
- Útil para auditoria comparar ambos os caminhos e alinhar texto/instruções.

### 3. Instrução Pedagógica Base

- Constante `PEDAGOGICAL_SYSTEM_INSTRUCTION` resume princípios de Mayer, estrutura de narrativa e formato esperado (`scriptText` + `visualPrompt`) ([src/config/constants/pedagogy.ts#L1-L25](src/config/constants/pedagogy.ts#L1-L25)).
- Ainda não foi injetada diretamente no fluxo principal; avaliar se incorporamos para garantir consistência.

### 4. Prompt de Geração de Imagem

- Descreve título, descrição textual, estilo visual mapeado e contexto do público. Inclui requisitos negativos (nada de texto pesado na imagem) para evitar ruído ([src/services/openaiService.ts#L254-L305](src/services/openaiService.ts#L254-L305)).

### 5. Refinamento de Conteúdo (texto inteiro)

- **System prompt** reforça refinamento educacional com preservação opcional de pontos‑chave ([src/services/openaiService.ts#L354-L388](src/services/openaiService.ts#L354-L388)).
- Suporta objetivos configuráveis (`clarity`, `engagement`, `brevity`, `formality`).
- Saída validada pelo `RefinedContentSchema` para registrar texto original, refinado, melhorias e score ([src/schemas/eduScriptSchemas.ts#L94-L108](src/schemas/eduScriptSchemas.ts#L94-L108)).

### 6. Refinamento Direto (beta SDK)

- Alternativa simplificada que usa `chat.completions.parse` com instruções semelhantes e o mesmo schema ([src/services/openaiService.ts#L411-L447](src/services/openaiService.ts#L411-L447)).

### 7. Feedback de Slide (texto + prompt visual)

- Prompt no Responses API que recebe script atual, prompt visual e feedback textual para ajustar ambos de forma coordenada ([src/services/openaiService.ts#L453-L489](src/services/openaiService.ts#L453-L489)).
- Produz `scriptText` + `visualPrompt` alinhados ao público.

## Heurísticas e Pré-processamentos

- **Mapeamento de público**: expressões regulares traduzem respostas livres do usuário para enums suportados pelo modelo (elementary → professional). Referência: [src/features/video-generation/api/videoGenerationApi.ts#L14-L39](src/features/video-generation/api/videoGenerationApi.ts#L14-L39).
- **Estimativa de duração**: usamos contagem de palavras (120 wpm) com limites de 3 a 12 min para informar o prompt ([src/features/video-generation/api/videoGenerationApi.ts#L41-L44](src/features/video-generation/api/videoGenerationApi.ts#L41-L44)).
- **Construção do texto exibido**: priorizamos `speakerNotes` (voz do apresentador); se ausentes, convertemos blocos textuais/listas em narrativa linear ([src/features/video-generation/api/videoGenerationApi.ts#L46-L71](src/features/video-generation/api/videoGenerationApi.ts#L46-L71)).
- **Prompts visuais**: preferimos descrições vindas dos blocos de conteúdo; na ausência, geramos um fallback genérico ([src/features/video-generation/api/videoGenerationApi.ts#L73-L84](src/features/video-generation/api/videoGenerationApi.ts#L73-L84)).
- **Estilo de imagem por aspect ratio**: 16:9 → illustrated, 9:16 → infographic, 1:1 → diagram ([src/features/video-generation/api/videoGenerationApi.ts#L25-L33](src/features/video-generation/api/videoGenerationApi.ts#L25-L33)).
- **Retries/logging**: todas as chamadas críticas passam por `withRetry` e escrevem logs estruturados para rastrear falhas de prompt ([src/services/openaiService.ts#L497-L574](src/services/openaiService.ts#L497-L574)).

## Checklist para Auditoria

1. **Consistência pedagógica**
   - System prompt atual reflete todos os princípios que queremos? Há lacunas (ex.: diversidade cultural, acessibilidade)?
2. **Escopo das instruções do usuário**
   - Precisamos pedir mais detalhes (idade, tom, idioma) antes de chamar o modelo?
3. **Limites de duração/slides**
   - A heurística 1.5–2× minutos → slides atende a todos os formatos? Avaliar conteúdo muito curto/longo.
4. **Imagem x Texto**
   - O prompt visual está claro o suficiente para evitar resultados com texto ou elementos inadequados?
5. **Refinamentos**
   - Falta algum objetivo recorrente (ex.: simplificação para LEP, traduções)?
6. **Fallback pedagógico**
   - Decidir se `PEDAGOGICAL_SYSTEM_INSTRUCTION` deve ser incorporado como system prompt único para todo o pipeline.
7. **Observabilidade**
   - Registrar o prompt final enviado (sanitizado) para permitir auditorias futuras.

## Próximos Passos Sugeridos

1. Rodar workshops com o time pedagógico para revisar cada prompt acima e propor atualizações.
2. Implementar feature flag que permite alternar rapidamente entre versões de prompt.
3. Adicionar testes automatizados (snapshots) que validem estrutura de saída e presença de elementos-chave após ajustes.
