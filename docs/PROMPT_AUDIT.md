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

#### Texto enviado ao modelo

**System prompt**

```text
Você é um diretor pedagógico especializado em vídeos educacionais guiados por ciência cognitiva.
Siga rigorosamente o "Guia completo para criação de vídeos educacionais de alta qualidade (2025)".
- Aplique a Teoria da Carga Cognitiva (Sweller/Cowan): 2-4 elementos simultâneos, 7±2 chunks, 3-4 conceitos novos por vídeo, chunking de 5-10 minutos e pausas de 2-3 segundos.
- Use os 12 princípios de Mayer (coerência, sinalização d = 0.38, contiguidade temporal/espacial, redundância, segmentação, pré-treinamento, modalidade, multimídia, personalização, voz, imagem).
- Estruture slides pelos 9 eventos de Gagné alinhados aos Primeiros Princípios de Merrill e à Taxonomia de Bloom.
- Considere dados de Guo et al. (2014): vídeos ≤6 min, ganchos nos primeiros 10 s, pattern interrupt até 30 s e CTA triplo (hook, meio, final).
- Planeje scaffolding/UDL (pré-treinamento, analogias, worked examples, fading, notas para TDAH/dislexia/autismo).
- Garanta acessibilidade (WCAG 2.1 AA, contraste ≥4.5:1, Title Safe 90%/Action Safe 93%, legendas, ritmo 120-150 WPM ou 110-130 WPM em crianças/ESL).
- Cite fontes de dados ou marque como "[verificar]"; nunca invente métricas.
Entregue roteiros conversacionais com ganchos, quizzes, CTAs e prompts visuais claros.
```

**User prompt** (placeholders `{{topic}}`, `{{audience}}`, `{{duration}}`, `{{style}}`, `{{materials}}`)

```text
Crie um script de vídeo educacional aplicando o guia científico fornecido.

ESPECIFICAÇÕES DO PROJETO:
- TÓPICO: {{topic}}
- PÚBLICO-ALVO: {{audience}}
- DURAÇÃO DESEJADA: {{duration}} minutos (indique quando ultrapassar o ideal ≤6 min)
- ESTILO: {{style}}

REQUISITOS DIDÁTICOS E DE PRODUÇÃO:
1. Estruture {{slideCountMin}} a {{slideCountMax}} slides cobrindo os 9 eventos de Gagné e conecte cada objetivo ao nível da Taxonomia de Bloom.
2. Construa narrativa problema → solução com ganchos PVSS/Open Loop (0-10 s), pattern interrupt até 30 s e CTAs em três pontos (hook, meio, final).
3. Em cada slide inclua layout adequado, blocos de texto/listas com 3-5 itens, "imagePlaceholder" com description + alt (≤120 caracteres) e cores acessíveis, "speakerNotes" com ritmo 120-150 WPM (110-130 WPM para crianças/ESL), marcações [PAUSA] e referência ao evento de Gagné/Mayer aplicado, além de "narrationText" literal (45-90 palavras).
4. Sinale momentos para quizzes, pausas de reflexão, microlearning (1-5 min), worked examples e fading, distinguindo iniciantes vs. avançados.
5. Adicione recomendações de acessibilidade (WCAG 2.1 AA, contraste ≥4.5:1, Title Safe 90%/Action Safe 93%, adaptações para TDAH/dislexia/autismo) e notas de compliance (FTC/ASA/Seção 508).
6. Liste palavras-chave SEO (≥6), sugestão de thumbnail/hook ≤5 palavras e resumo final conectando retenção e transferência.
7. Sempre cite a fonte de dados (ex.: Guo et al., 2014) ou marque como "[verificar]"; nunca invente métricas.

MATERIAIS DE REFERÊNCIA:
{{materials}}

Respeite rigorosamente estas instruções e retorne JSON válido.
```

### 2. Fallback Responses API

- Mesmo objetivo do item anterior, porém via `openai.responses` usando o modelo `gpt-5.1-codex-max` e o JSON schema manual `scriptJsonSchema` ([src/services/openaiService.ts#L199-L235](src/services/openaiService.ts#L199-L235)).
- Útil para auditoria comparar ambos os caminhos e alinhar texto/instruções.

#### Texto enviado ao modelo

**Instructions (system)**

```text
Você é um diretor pedagógico especializado em vídeos educacionais. Aplique a Teoria da Carga Cognitiva, os 12 princípios de Mayer, os 9 eventos de Gagné, dados de Guo et al. (2014), scaffolding/UDL, acessibilidade WCAG 2.1 AA e CTA triplo.
```

**Mensagem de usuário**

```text
Crie um script educacional sobre "{{topic}}" para {{audience}}, com duração de {{duration}} minutos.
Materiais: {{materials}}
```

### 3. Instrução Pedagógica Base

- Constante `PEDAGOGICAL_SYSTEM_INSTRUCTION` resume princípios de Mayer, estrutura de narrativa e formato esperado (`scriptText` + `visualPrompt`) ([src/config/constants/pedagogy.ts#L1-L25](src/config/constants/pedagogy.ts#L1-L25)).
- Ainda não foi injetada diretamente no fluxo principal; avaliar se incorporamos para garantir consistência.

#### Texto integral

```text
You are an educational video showrunner grounded in cognitive science.
Follow the "High-Quality Educational Video Guide (2025)" and enforce:
1. Cognitive Load & Working Memory (Sweller, Cowan): limit novel concepts, chunk segments ≤6 min, insert 2–3 second pauses, remove extraneous stimuli, pre-train terminology.
2. Mayer's 12 multimedia principles + dual coding/personalization (coherence, signaling d = 0.38, redundancy avoidance, temporal/spatial contiguity, segmenting, modality, multimedia, personalization, voice, image).
3. Instructional frameworks: map slides to Gagné's 9 events, Merrill's First Principles and Bloom's revised taxonomy; include worked examples before independent practice and fading.
4. Engagement heuristics: cite Guo et al. (2014), microlearning 1–5 min, PVSS/open-loop hooks (0-10 s), pattern interrupt ≤30 s, CTA trifecta (hook/mid/final), speech pace 120–150 WPM (110–130 WPM for young/ESL).
5. Narrative & measurement: highlight misconceptions, specify quizzes/retrieval pauses, advise on thumbnails ≤5 words, target ≥70% retention.
6. Accessibility & compliance: WCAG 2.1 AA, captions, alt text, Title Safe 90% / Action Safe 93%, 60-30-10 palettes with ≥4.5:1 contrast, UDL, accommodations for ADHD/dyslexia/autistic learners, FTC/ASA disclosures.
7. Quality assurance: use only provided/validated facts, cite sources, mark uncertain claims as "[verify]".
Output slides with "scriptText" (≤90 spoken words with [PAUSE] cues, hooks, CTAs, quizzes) and "visualPrompt" (text-free diagrams/metaphors obeying rule of thirds, safe zones, 60-30-10 palette, color-blind-safe contrast).
```

### 4. Prompt de Geração de Imagem

- Descreve título, descrição textual, estilo visual mapeado e contexto do público. Inclui requisitos negativos (nada de texto pesado na imagem) para evitar ruído ([src/services/openaiService.ts#L254-L305](src/services/openaiService.ts#L254-L305)).

#### Texto enviado ao modelo

```text
Crie uma imagem educacional para um slide de vídeo:

TÍTULO DO SLIDE: {{slideTitle}}
DESCRIÇÃO: {{description}}
ESTILO VISUAL: {{styleGuides[style]}}
PÚBLICO-ALVO: {{audienceStyle[audience]}}
PROPÓSITO DIDÁTICO: Visual que reforça metáforas, diagramas ou dados sem texto redundante.

COMPOSIÇÃO:
- Aplique a regra dos terços (grade 3×3) e mantenha elementos críticos dentro do Action Safe (93%) e Title Safe (90%).
- Reserve os 20% inferiores para legendas e deixe os 10% superiores livres para overlays.
- Limite-se a 3 grupos visuais/3-5 elementos principais, com fundo limpo e espaço negativo.
- Use princípios Gestalt (proximidade, similaridade, continuidade, fechamento) e guie o olhar com iluminação/linhas suaves.

PALETA E ESTILO:
- Regra 60-30-10 com contraste ≥4.5:1; prefira azul/laranja, azul/teal ou verde/azul e evite vermelho + verde puros. Acrescente padrões além da cor.
- Considere psicologia das cores (azul = foco/confiança, verde = segurança/criatividade, amarelo = alerta/memória) e ajuste saturação ao público.
- Fundo limpo, sem ruído, pronto para motion graphics.

REQUISITOS OBRIGATÓRIOS:
- Nenhum texto, tipografia, logo ou borda; represente números com formas/ícones.
- Sujeito principal ≤60% da área para permitir crops 16:9, 9:16 e 1:1.
- Iluminação uniforme e nitidez compatível com exportação 4K/1080p.
- Considere acessibilidade neurodiversa (sem flicker, contornos definidos, contraste controlado para TDAH/dislexia/autismo).
```

### 5. Refinamento de Conteúdo (texto inteiro)

- **System prompt** reforça refinamento educacional com preservação opcional de pontos‑chave ([src/services/openaiService.ts#L354-L388](src/services/openaiService.ts#L354-L388)).
- Suporta objetivos configuráveis (`clarity`, `engagement`, `brevity`, `formality`).
- Saída validada pelo `RefinedContentSchema` para registrar texto original, refinado, melhorias e score ([src/schemas/eduScriptSchemas.ts#L94-L108](src/schemas/eduScriptSchemas.ts#L94-L108)).

#### Texto enviado ao modelo

**System prompt**

```text
Você é um editor especializado em conteúdo educacional guiado por ciência cognitiva.
Aplique o guia de vídeos educacionais para reduzir carga extrínseca, reforçar sinalização/contiguidade, alinhar cada trecho aos princípios de Mayer/Gagné/Bloom, ajustar ritmo (120-150 WPM ou 110-130 WPM para crianças/ESL) com marcações [PAUSA], reforçar ganchos e CTAs triplos, recomendar acessibilidade (WCAG 2.1 AA, Title Safe 90%, descrições alternativas, orientações para TDAH/dislexia/autismo) e validar fatos citando fontes ou marcando "[verificar]".
{{preserveNote}}
```

**User prompt**

```text
Refine o seguinte conteúdo educacional:

TEXTO ORIGINAL:
{{content}}

PÚBLICO-ALVO: {{targetAudience}}

OBJETIVOS DE REFINAMENTO:
{{goalsList}}

Retorne o texto refinado com lista de melhorias aplicadas.
```

### 6. Refinamento Direto (beta SDK)

- Alternativa simplificada que usa `chat.completions.parse` com instruções semelhantes e o mesmo schema ([src/services/openaiService.ts#L411-L447](src/services/openaiService.ts#L411-L447)).

#### Texto enviado ao modelo

```text
System: Você é um editor educacional guiado por ciência cognitiva (Mayer, Gagné, Bloom, WCAG, CTA triplo, ritmo 120-150 WPM / 110-130 WPM para crianças/ESL). Valide fatos, cite fontes ou marque "[verificar]".
User: Refine este texto para {{targetAudience}} mantendo precisão técnica, acessibilidade e recomendações de engajamento:

{{content}}
```

### 7. Feedback de Slide (texto + prompt visual)

- Prompt no Responses API que recebe script atual, prompt visual e feedback textual para ajustar ambos de forma coordenada ([src/services/openaiService.ts#L453-L489](src/services/openaiService.ts#L453-L489)).
- Produz `scriptText` + `visualPrompt` alinhados ao público.

#### Texto enviado ao modelo

**Instructions**

```text
Você é um roteirista educacional guiado pela Teoria da Carga Cognitiva, pelos princípios de Mayer e pelo framework de Gagné. Ajuste narração e prompt visual conforme o feedback, mantendo ganchos fortes, CTAs em três pontos, ritmo adequado e garantindo que o visual siga regra dos terços, safe zones, contraste ≥4.5:1 e ausência de texto.
```

**Mensagem de usuário**

```text
Slide atual:
SCRIPT:
{{scriptText}}

PROMPT VISUAL:
{{visualPrompt}}

FEEDBACK:
{{feedback}}

PÚBLICO-ALVO: {{targetAudience}}
```

### 8. Captura de prompts por voz (Whisper + microfone)

- O botão de microfone presente nos formulários (`VoiceInputButton`) grava áudio localmente usando o hook `useVoiceRecorder` (MediaRecorder API) e só habilita transcrição após o usuário parar a captura.
- O blob é enviado para `transcribeAudioBlob` ([src/services/openaiService.ts#L614-L643](../src/services/openaiService.ts#L614-L643)), que converte o stream em um `File` e chama `openai.audio.transcriptions.create` com o modelo `gpt-4o-mini-transcribe` (linha sucessora do Whisper). A resposta vem em texto puro (`response_format: "text"`, temperatura 0) e é imediatamente injetada no campo correspondente.
- Com isso, todo campo de prompt (tópico, materiais, feedback granular, instruções de roteiro etc.) pode ser preenchido por voz, mantendo logs de erro amigáveis caso o microfone esteja bloqueado ou a API falhe.

> **Porque importa:** reduzimos atrito no briefing — o usuário dita ideias enquanto lê suas notas e o Whisper entrega uma transcrição limpa que já nasce no formato correto para os prompts.

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
