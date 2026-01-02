export type PromptCategory =
  | 'educational'
  | 'marketing'
  | 'events'
  | 'guide'
  | 'review';

export type PromptBlueprintId =
  | 'educational-introduce-concept'
  | 'educational-reinforce-knowledge'
  | 'educational-assessment-prep'
  | 'marketing-product-launch'
  | 'marketing-authority-play'
  | 'marketing-conversion-sprint'
  | 'events-pre-event-teaser'
  | 'events-live-coverage'
  | 'events-post-event-recap'
  | 'guide-step-by-step'
  | 'guide-tooling-spotlight'
  | 'guide-operational-checklist'
  | 'review-technical-deep-dive'
  | 'review-unboxing-first-impressions'
  | 'review-competitive-comparison';

type ScriptStyle = 'formal' | 'casual' | 'engaging';

export type PromptBlueprint = {
  id: PromptBlueprintId;
  category: PromptCategory;
  title: string;
  summary: string;
  icon: string;
  docFile: string;
  slidesRange?: { min: number; max: number } | null;
  durationMinutes?: { min: number; max: number } | null;
  defaultStyle: ScriptStyle;
  tags: string[];
};

export const PROMPT_CATEGORY_METADATA: Record<
  PromptCategory,
  { label: string; description: string; icon: string }
> = {
  educational: {
    label: 'Educação',
    description: 'Roteiros pedagógicos guiados por ciência da aprendizagem.',
    icon: '🧠',
  },
  marketing: {
    label: 'Marketing',
    description: 'Estratégias de lançamento, autoridade e conversão.',
    icon: '🚀',
  },
  events: {
    label: 'Eventos',
    description: 'Teasers, cobertura em tempo real e recaps mensuráveis.',
    icon: '🎤',
  },
  guide: {
    label: 'Guias',
    description: 'Tutoriais operacionais e demonstrações de ferramentas.',
    icon: '🧭',
  },
  review: {
    label: 'Reviews',
    description: 'Análises técnicas, unboxings e comparativos.',
    icon: '🔍',
  },
};

export const PROMPT_BLUEPRINTS: PromptBlueprint[] = [
  {
    id: 'educational-introduce-concept',
    category: 'educational',
    title: 'Introduzir conceito novo',
    summary:
      'Storytelling problema → solução com scaffolding completo; a duração e o nº de slides são definidos pelas notas do usuário.',
    icon: '📘',
    docFile:
      'compass_artifact_wf-f802b3a9-6a9b-42ea-93e6-d0b950aa9f5c_text_markdown.md',
    slidesRange: null,
    durationMinutes: null,
    defaultStyle: 'engaging',
    tags: ['scaffolding', 'diagramas', 'gancho forte'],
  },
  {
    id: 'educational-reinforce-knowledge',
    category: 'educational',
    title: 'Reforçar conhecimento',
    summary:
      'Foco em quizzes visuais e comparações rápidas, ajustando quantidade e duração conforme o briefing.',
    icon: '🔁',
    docFile:
      'compass_artifact_wf-71fcea04-a94a-48c9-b907-59c52136d0d2_text_markdown.md',
    slidesRange: null,
    durationMinutes: null,
    defaultStyle: 'engaging',
    tags: ['retrieval', 'spaced practice', 'microlearning'],
  },
  {
    id: 'educational-assessment-prep',
    category: 'educational',
    title: 'Preparar avaliação',
    summary:
      'Checklists, rubricas e redução de ansiedade com duração adaptada ao pedido do usuário.',
    icon: '✅',
    docFile:
      'compass_artifact_wf-9c8d339a-dc43-4f11-ac5d-6cff16db51ef_text_markdown.md',
    slidesRange: null,
    durationMinutes: null,
    defaultStyle: 'formal',
    tags: ['rubricas', 'ansiedade', 'checklists'],
  },
  {
    id: 'marketing-product-launch',
    category: 'marketing',
    title: 'Lançamento de produto',
    summary: '4 slides PSPC com CTA final agressivo e hero shot.',
    icon: '💡',
    docFile:
      'compass_artifact_wf-cbb4d8b4-1b71-40f5-94eb-c72b9fb0d801_text_markdown.md',
    slidesRange: { min: 4, max: 4 },
    durationMinutes: { min: 1, max: 2 },
    defaultStyle: 'engaging',
    tags: ['PSPC', 'hero shot', 'CTA'],
  },
  {
    id: 'marketing-authority-play',
    category: 'marketing',
    title: 'Campanha de autoridade',
    summary: '5 slides com depoimentos, thought leadership e prova social.',
    icon: '🏛️',
    docFile:
      'compass_artifact_wf-cba439ad-cea5-4c35-a854-615eb73d67bb_text_markdown.md',
    slidesRange: { min: 5, max: 5 },
    durationMinutes: { min: 2, max: 3 },
    defaultStyle: 'formal',
    tags: ['prova social', 'thought leadership', 'regulações'],
  },
  {
    id: 'marketing-conversion-sprint',
    category: 'marketing',
    title: 'Conversão direta',
    summary: '3 slides sub-60s com urgência, timers e oferta limitada.',
    icon: '⚡',
    docFile:
      'compass_artifact_wf-5ce4a4d3-6429-41d1-a6c0-c0e8fcac4be0_text_markdown.md',
    slidesRange: { min: 3, max: 3 },
    durationMinutes: { min: 1, max: 1 },
    defaultStyle: 'casual',
    tags: ['urgência', 'hook 3s', 'contagem regressiva'],
  },
  {
    id: 'events-pre-event-teaser',
    category: 'events',
    title: 'Teaser pré-evento',
    summary: '5 slides com ritmo ascendente e contagem regressiva.',
    icon: '⏰',
    docFile:
      'compass_artifact_wf-a2cf54f1-ba2f-49ea-a954-15a37777f5fa_text_markdown.md',
    slidesRange: { min: 5, max: 5 },
    durationMinutes: { min: 1, max: 2 },
    defaultStyle: 'engaging',
    tags: ['ritmo ascendente', 'CTA registro', 'FOMO'],
  },
  {
    id: 'events-live-coverage',
    category: 'events',
    title: 'Cobertura em tempo real',
    summary: '4 slides com narrativa antes/durante/depois e cortes rápidos.',
    icon: '📡',
    docFile:
      'compass_artifact_wf-29b6c56f-300e-44c5-8d8d-34b29907ddf6_text_markdown.md',
    slidesRange: { min: 4, max: 4 },
    durationMinutes: { min: 2, max: 3 },
    defaultStyle: 'casual',
    tags: ['timestamp', 'shot list', 'multicam'],
  },
  {
    id: 'events-post-event-recap',
    category: 'events',
    title: 'Recap pós-evento',
    summary: '6 slides com métricas, depoimentos e CTA próximo evento.',
    icon: '📊',
    docFile:
      'compass_artifact_wf-fdb99af3-4bc0-4386-bf98-2405536b80e0_text_markdown.md',
    slidesRange: { min: 6, max: 6 },
    durationMinutes: { min: 2, max: 3 },
    defaultStyle: 'formal',
    tags: ['métricas', 'testemunhos', 'save the date'],
  },
  {
    id: 'guide-step-by-step',
    category: 'guide',
    title: 'Guia passo a passo',
    summary: '6-7 slides sequenciais com checkpoints e troubleshooting.',
    icon: '🪜',
    docFile:
      'compass_artifact_wf-81f243f2-ad7c-4998-bc0d-50d9a5260d20_text_markdown.md',
    slidesRange: { min: 6, max: 7 },
    durationMinutes: { min: 3, max: 5 },
    defaultStyle: 'engaging',
    tags: ['processo', 'indicador de progresso', 'erros comuns'],
  },
  {
    id: 'guide-tooling-spotlight',
    category: 'guide',
    title: 'Spotlight de funcionalidade',
    summary: '5 slides Problema → Funcionalidade → Benefício → Prova → CTA.',
    icon: '🛠️',
    docFile:
      'compass_artifact_wf-2a508d4e-a9fb-44e7-8da3-d7e8ab983b50_text_markdown.md',
    slidesRange: { min: 5, max: 5 },
    durationMinutes: { min: 1, max: 2 },
    defaultStyle: 'engaging',
    tags: ['JTBD', 'demo UI', 'PAS'],
  },
  {
    id: 'guide-operational-checklist',
    category: 'guide',
    title: 'Checklist operacional',
    summary: '5 slides com do/don’t, nudges comportamentais e conformidade.',
    icon: '📋',
    docFile:
      'compass_artifact_wf-bcab45aa-21ae-4585-8315-2cd5897c2a86_text_markdown.md',
    slidesRange: { min: 5, max: 5 },
    durationMinutes: { min: 2, max: 3 },
    defaultStyle: 'formal',
    tags: ['compliance', 'nudges', 'microlearning'],
  },
  {
    id: 'review-technical-deep-dive',
    category: 'review',
    title: 'Review técnico profundo',
    summary: '5 slides com benchmarks, critérios e disclosure FTC/CONAR.',
    icon: '🧪',
    docFile:
      'compass_artifact_wf-522cd4f8-a7a4-41bc-b168-72dad999d3e8_text_markdown.md',
    slidesRange: { min: 5, max: 5 },
    durationMinutes: { min: 3, max: 4 },
    defaultStyle: 'formal',
    tags: ['benchmark', 'metodologia', 'ética'],
  },
  {
    id: 'review-unboxing-first-impressions',
    category: 'review',
    title: 'Unboxing e primeiras impressões',
    summary: '4 slides rápidos focados em emoção, embalagem e reação.',
    icon: '🎁',
    docFile:
      'compass_artifact_wf-29142666-77a7-4322-b99a-3de2bd4f05f9_text_markdown.md',
    slidesRange: { min: 4, max: 4 },
    durationMinutes: { min: 1, max: 2 },
    defaultStyle: 'casual',
    tags: ['emoção', 'embalagem', 'CTA imediato'],
  },
  {
    id: 'review-competitive-comparison',
    category: 'review',
    title: 'Comparativo com concorrentes',
    summary: '4-5 slides MECE com scorecards e transparência metodológica.',
    icon: '⚖️',
    docFile:
      'compass_artifact_wf-f1839c6e-45be-4d7a-8aa5-85704399609e_text_markdown.md',
    slidesRange: { min: 4, max: 5 },
    durationMinutes: { min: 2, max: 3 },
    defaultStyle: 'formal',
    tags: ['MECE', 'scorecard', 'divulgação'],
  },
];

export const DEFAULT_PROMPT_BLUEPRINT_ID: PromptBlueprintId =
  'educational-introduce-concept';

const blueprintMap = new Map<PromptBlueprintId, PromptBlueprint>(
  PROMPT_BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint]),
);

export const isPromptBlueprintId = (
  value: unknown,
): value is PromptBlueprintId =>
  typeof value === 'string' && blueprintMap.has(value as PromptBlueprintId);

export const getPromptBlueprintById = (
  id: PromptBlueprintId | undefined,
): PromptBlueprint =>
  blueprintMap.get(id ?? DEFAULT_PROMPT_BLUEPRINT_ID) ??
  blueprintMap.get(DEFAULT_PROMPT_BLUEPRINT_ID)!;

export const getPromptDocRelativePath = (blueprint: PromptBlueprint): string =>
  `docs/prompts/${blueprint.docFile}`;

export const getBlueprintsByCategory = (
  category: PromptCategory,
): PromptBlueprint[] =>
  PROMPT_BLUEPRINTS.filter((blueprint) => blueprint.category === category);

export const PROMPT_CATEGORIES: PromptCategory[] = [
  'educational',
  'marketing',
  'events',
  'guide',
  'review',
];
