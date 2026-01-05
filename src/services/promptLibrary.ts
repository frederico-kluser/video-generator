import type { ImageAspectRatio } from '@/config/constants/imageGeneration';
import {
  COMPOSITION_GUIDES,
  SAFE_ZONE_INSTRUCTIONS,
  SUBTITLE_SPACE_INSTRUCTIONS,
} from '@/config/constants/imagePrompts';
import type { Script } from '@/schemas/eduScriptSchemas';

/**
 * Taxonomia simplificada usada na UI para refletir o tom narrativo desejado e
 * propagar essa escolha para os prompts de roteiro.
 */
export type ScriptStyle = 'formal' | 'casual' | 'engaging';

/**
 * Enumeração dos objetivos de refinamento textual aplicados em revisões rápidas.
 * Cada opção ativa instruções diferentes no prompt de edição.
 */
export type RefinementGoal = 'clarity' | 'engagement' | 'brevity' | 'formality';

/**
 * Prompt de sistema que posiciona o modelo como diretor pedagógico responsável por sintetizar roteiros completos.
 *
 * O texto descreve princípios de carga cognitiva, Gagné, Mayer, dados de engajamento e critérios de acessibilidade
 * para garantir que cada resposta siga rigorosamente a cartilha científica adotada pelo produto. Esse bloco nunca
 * muda entre execuções e serve como a âncora principal para manter consistência pedagógica, legal e de qualidade.
 */
export const SCRIPT_GENERATION_SYSTEM_PROMPT = `Você é um diretor pedagógico especializado em vídeos educacionais guiados por ciência cognitiva.
Siga rigorosamente o "Guia completo para criação de vídeos educacionais de alta qualidade (2025)" e aplique estes princípios:

- Teoria da Carga Cognitiva de Sweller/Cowan: memória de trabalho processa 2-4 elementos e 7±2 chunks. Limite 3-4 conceitos novos por vídeo, use chunking de 5-10 minutos e insira pausas de 2-3 segundos entre ideias densas.
- Princípios de Mayer (coerência, sinalização d = 0.38, contiguidade temporal/espacial, redundância, segmentação, pré-treinamento, modalidade, multimídia, personalização, voz e imagem) para reduzir carga extrínseca e destacar cues críticos.
- Nove eventos instrucionais de Gagné alinhados aos Primeiros Princípios de Merrill e à Taxonomia revisada de Bloom; mapeie objetivos por nível (Lembrar→Criar) e descreva quando usar exemplos trabalhados, prática guiada e transferência.
- Dados de engajamento de Guo et al. (2014): mantenha vídeos ≤6 minutos quando possível, sinalize quando o conteúdo exigir 6-15 minutos, inclua ganchos nos primeiros 10 segundos, pattern interrupt até 30 segundos e CTA em três pontos (após hook, no pico de valor e no final).
- Estratégias de scaffolding e UDL: pré-treine termos, use analogias concretas, worked examples antes de tarefas independentes, fading gradual, recomendações específicas para TDAH, dislexia e aprendizes no espectro autista.
- Acessibilidade e compliance: lembrar legendas, ritmo alvo de 120-150 WPM (110-130 WPM para crianças/ESL), safe zones (Action Safe 93%, Title Safe 90%), contraste ≥4.5:1, divulgações (FTC/ASA/Seção 508), CTAs claros e notas de adaptabilidade multiplataforma.
- Qualidade da evidência: cite a fonte quando usar números de pesquisa, marque como "[verificar]" quando não houver confirmação e nunca invente dados.

Entregue roteiros prontos para gravação, com linguagem conversacional, precisão técnica e indicações claras de ganchos, quizzes, CTAs, pausas e prompts visuais.`;

/**
 * Conjunto completo de parâmetros que contextualizam um pedido de roteiro.
 * Cada campo alimenta trechos específicos do prompt do usuário para que o modelo saiba
 * qual é o tema, para quem está produzindo, qual o ritmo desejado e quais limites ou
 * instruções adicionais precisam ser respeitados.
 */
export interface ScriptGenerationPromptContext {
  materials: string;
  topic: string;
  targetAudience: Script['targetAudience'];
  desiredDuration: number;
  style?: ScriptStyle;
  revisionInstructions?: string;
  preferUserLength: boolean;
  slideCountRange: { min: number; max: number };
}

/**
 * Monta o prompt enviado como mensagem de usuário para a API de roteiros.
 *
 * O texto descreve o briefing completo (tópico, público, duração, estilo e materiais)
 * e ainda injeta checklists pedagógicos para cada slide. Centralizar essa função evita
 * divergências entre telas e garante rastreabilidade das instruções usadas na auditoria.
 */
export function buildScriptGenerationUserPrompt(
  context: ScriptGenerationPromptContext,
): string {
  const revisionBlock = context.revisionInstructions
    ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${context.revisionInstructions.trim()}\n`
    : '';

  return `Crie um script de vídeo educacional aplicando o guia científico fornecido.

ESPECIFICAÇÕES DO PROJETO:
- TÓPICO: ${context.topic}
- PÚBLICO-ALVO: ${context.targetAudience}
- ${context.preferUserLength ? `DURAÇÃO ESTIMADA: ~${context.desiredDuration} minutos (ajuste se o usuário especificar outro valor nas notas).` : `DURAÇÃO DESEJADA: ${context.desiredDuration} minutos (indique quando exceder o limite ideal de 6 minutos)`}
- ESTILO: ${context.style ?? 'engaging'}
- REFERÊNCIAS DE TAMANHO: Inspecione os materiais/notas e obedeça instruções explícitas sobre número de slides ou duração (ex.: "quero 6 slides em 5 minutos"). Quando nada for informado, escolha a combinação que maximize clareza e ritmo cognitivo.
${revisionBlock}
REQUISITOS DIDÁTICOS E DE PRODUÇÃO:
${context.preferUserLength ? `1. Determine a quantidade ideal de slides analisando o volume de conteúdo e quaisquer instruções nas notas, garantindo cobertura explícita dos 9 eventos de Gagné (ganhar atenção, informar objetivos, ativar conhecimento prévio, apresentar conteúdo, fornecer orientação, provocar desempenho, oferecer feedback, avaliar e promover retenção/transferência) e mapeando cada objetivo aos níveis da Taxonomia de Bloom.` : `1. Estruture ${context.slideCountRange.min} a ${context.slideCountRange.max} slides cobrindo os 9 eventos de Gagné (ganhar atenção, informar objetivos, ativar conhecimento prévio, apresentar conteúdo, fornecer orientação, provocar desempenho, oferecer feedback, avaliar e promover retenção/transferência) e conecte cada objetivo ao nível correspondente da Taxonomia de Bloom.`}
2. Garanta narrativa problema → solução com ganchos PVSS/Open Loop nos primeiros 10 segundos, pattern interrupt até 30 segundos e CTAs em três pontos (hook, meio, final) alinhados ao objetivo pedagógico.
3. Para cada slide forneça:
   - Layout apropriado (title, content, twoColumn, imageLeft ou imageRight).
   - Blocos textuais ou listas com no máximo 3-5 itens e 3-5 palavras por elemento, sem redundância com a narração.
   - Um "imagePlaceholder" contendo "description" clara do visual (diagramas, metáforas, dados) e "alt" descritivo (≤120 caracteres) enfatizando o foco educacional e cores acessíveis (azul/laranja, azul/teal, evitar vermelho+verde).
   - "speakerNotes" com instruções de ritmo (120-150 WPM – reduza para 110-130 WPM em crianças/ESL), marcações de [PAUSA 2s], dicas de entonação e indicação explícita do evento de Gagné e do princípio de Mayer aplicado.
   - "narrationText" literal com 45-90 palavras, tom conversacional e sem metalinguagem.
4. Sinalize momentos ideais para quizzes embutidos, prompts de pausa, microlearning de 1-5 minutos, exemplos trabalhados e fading, especificando quando são voltados a iniciantes ou aprendizes avançados.
5. Inclua recomendações de acessibilidade (legendagem, contraste ≥4.5:1, Title Safe 90%/Action Safe 93%, descrições de áudio, orientações para TDAH/dislexia/autismo) e notas de compliance (divulgações FTC/ASA/Seção 508 quando houver patrocínio).
6. Forneça palavras-chave SEO (mínimo 6), sugestão de thumbnail/hook textual de até 5 palavras e resumo final que conecte retenção e transferência.
7. Sempre que citar números ou pesquisas, referencie a fonte (ex.: Guo et al., 2014) ou marque como "[verificar]"; nunca invente métricas.
8. Defina o campo booleano "isMathProject" como true apenas quando o conteúdo for predominantemente matemático (álgebra, cálculo, geometria, estatística, trigonometria ou demonstrações numéricas); caso contrário, retorne false.

MATERIAIS DE REFERÊNCIA:
${context.materials}

Respeite rigorosamente estas instruções e retorne JSON compatível com o schema.`;
}

const STYLE_GUIDES: Record<SlideImagePromptContext['style'], string> = {
  realistic: 'fotorrealista, alta qualidade, iluminação profissional',
  illustrated: 'ilustração digital, cores vibrantes, estilo educacional amigável',
  diagram: 'diagrama técnico limpo, linhas precisas, áreas bem delimitadas, fundo branco',
  infographic: 'infográfico moderno, ícones flat, blocos de cor coordenados, sem texto',
};

const AUDIENCE_STYLE: Record<Script['targetAudience'], string> = {
  elementary: 'cores brilhantes, personagens cartoon, visual divertido e amigável',
  middleSchool: 'visual moderno, levemente estilizado, engajante',
  highSchool: 'design contemporâneo, profissional mas acessível',
  college: 'visual acadêmico profissional, limpo e sofisticado',
  professional: 'design corporativo, minimalista, alta qualidade',
};

/**
 * Descreve todos os parâmetros necessários para gerar o prompt de imagens
 * (título do slide, descrição do visual, guias de estilo e referências enviadas).
 */
export interface SlideImagePromptContext {
  slideTitle: string;
  description: string;
  style: keyof typeof STYLE_GUIDES;
  targetAudience: Script['targetAudience'];
  aspectRatio: ImageAspectRatio;
  styleNotes?: string | null;
  hasReferences: boolean;
}

/**
 * Compõe o prompt de imagem completo usado pelo endpoint GPT-Image.
 *
 * Além da descrição criativa, o texto injeta instruções rígidas de composição,
 * acessibilidade e consistência cromática. Também concatena anchors enviados pelo
 * usuário e orientações para quando existem imagens de referência no upload.
 */
export function buildSlideImagePrompt(
  context: SlideImagePromptContext,
): string {
  const basePrompt = `
Crie uma imagem educacional para um slide de vídeo:

TÍTULO DO SLIDE: ${context.slideTitle}
DESCRIÇÃO: ${context.description}
ESTILO VISUAL: ${STYLE_GUIDES[context.style]}
PÚBLICO-ALVO: ${AUDIENCE_STYLE[context.targetAudience]}
PROPÓSITO DIDÁTICO: Visual que apoie a narrativa sem texto redundante, reforçando metáforas, diagramas ou dados-chave.

COMPOSIÇÃO E ORIENTAÇÃO:
${COMPOSITION_GUIDES[context.aspectRatio]}
${SAFE_ZONE_INSTRUCTIONS[context.aspectRatio]}
${SUBTITLE_SPACE_INSTRUCTIONS[context.aspectRatio]}
- Aplique a regra dos terços (grade 3×3) e mantenha elementos críticos dentro do Action Safe (93%) e do Title Safe (90%).
- Reserve os 20% inferiores para legendas e mantenha os 10% superiores limpos para overlays futuros.
- Limite-se a no máximo 3 grupos visuais e 3-5 elementos principais para reduzir carga extrínseca.
- Use princípios Gestalt (proximidade, similaridade, continuidade, fechamento) e guie o olhar com linhas/iluminação suave.

PALETA E ESTILO:
- Adote a regra 60-30-10 de cores com contraste mínimo 4.5:1; prefira combinações azul/laranja, azul/teal ou verde/azul e evite vermelho + verde puros. Utilize padrões além da cor para diferenciar categorias.
- Considere psicologia das cores: azul para foco/confiança, verde para segurança/criatividade, amarelo para alerta/memorização.
- Ajuste saturação ao público (estética vibrante e personagens antropomórficos para 3-11 anos; minimalismo premium para profissionais).
- Mantenha fundo limpo com espaço negativo suficiente para texto e motion graphics posteriores.

REQUISITOS OBRIGATÓRIOS:
- Sem textos, tipografia, logos, bordas ou marcas d'água; represente números via formas ou ícones.
- Sujeito principal ocupando no máximo 60% da área para facilitar crops 16:9, 9:16 e 1:1.
- Iluminação uniforme, sombras difusas e nitidez adequada para exportação 4K/1080p.
- Considere acessibilidade neurodiversa: evite flicker, ruído visual excessivo e contraste agressivo; mantenha contornos definidos para apoiar TDAH/dislexia/autismo.
`.trim();

  const userAnchors = context.styleNotes?.trim();
  const styleNotesBlock = userAnchors
    ? `ÂNCORAS DO USUÁRIO:\n${userAnchors}`
    : '';

  const referencesBlock = context.hasReferences
    ? 'Use as imagens fornecidas (Image 1...N) como referência direta de paleta, iluminação, textura e pinceladas. Preserve os traços principais e aplique-os somente ao novo conteúdo descrito.'
    : '';

  return [basePrompt, styleNotesBlock, referencesBlock]
    .filter(Boolean)
    .join('\n\n');
}

const REFINEMENT_GOAL_DESCRIPTIONS: Record<RefinementGoal, string> = {
  clarity: 'Melhorar clareza e compreensibilidade',
  engagement: 'Tornar mais envolvente e interessante',
  brevity: 'Reduzir verbosidade mantendo significado',
  formality: 'Ajustar tom formal/informal conforme público',
};

/**
 * Gera o prompt de sistema utilizado em refinamentos textuais.
 *
 * A função permite ativar o modo "preserveKeyPoints", inserindo instruções explícitas
 * para que o modelo não descarte argumentos críticos enquanto reescreve o conteúdo.
 */
export function buildRefineContentSystemPrompt(options: {
  preserveKeyPoints?: boolean;
} = {}): string {
  return `Você é um editor especializado em conteúdo educacional guiado por ciência cognitiva.
Aplique o guia de vídeos educacionais de alta qualidade para reduzir carga extrínseca, reforçar sinalização/contiguidade e alinhar cada trecho aos princípios de Mayer, Gagné e Bloom.
- Ajuste ritmo para 120-150 WPM (ou 110-130 WPM para crianças/ESL) e marque [PAUSA] onde necessário.
- Reforce ganchos, CTAs em três pontos, analogias concretas, exemplos trabalhados e recomendações de acessibilidade (WCAG 2.1 AA, Title Safe 90%, descrições alternativas, orientações para TDAH/dislexia/autismo).
- Revise afirmações factuais usando apenas o texto fornecido; cite a fonte quando disponível e marque como "[verificar]" se houver dúvida.
${options.preserveKeyPoints ? 'IMPORTANTE: Preserve todos os pontos-chave do original.' : ''}`;
}

/**
 * Pacote mínimo de dados para contextualizar uma revisão textual.
 * Inclui o conteúdo original, o público que receberá o material e
 * os objetivos selecionados pelo usuário (clareza, engajamento, etc.).
 */
export interface RefineContentPromptContext {
  content: string;
  targetAudience: Script['targetAudience'];
  refinementGoals: RefinementGoal[];
}

/**
 * Constrói a mensagem de usuário enviada ao fluxo de refinamento.
 * Detalha o texto original, o perfil de audiência e lista os objetivos em formato bullet
 * para incentivar o modelo a justificar as melhorias devolvidas.
 */
export function buildRefineContentUserPrompt(
  context: RefineContentPromptContext,
): string {
  const goals = context.refinementGoals
    .map((goal) => `- ${REFINEMENT_GOAL_DESCRIPTIONS[goal]}`)
    .join('\n');

  return `Refine o seguinte conteúdo educacional:

TEXTO ORIGINAL:
${context.content}

PÚBLICO-ALVO: ${context.targetAudience}

OBJETIVOS DE REFINAMENTO:
${goals}

Retorne o texto refinado com lista de melhorias aplicadas.`;
}

/**
 * Prompt de sistema dedicado ao fluxo de ajustes finos por slide.
 * Explica ao modelo que ele deve agir como roteirista sênior, acatar o feedback humano
 * e manter critérios de composição visual e narrativa durante microedições.
 */
export const SLIDE_FEEDBACK_SYSTEM_PROMPT =
  'Você é um roteirista educacional guiado pela Teoria da Carga Cognitiva, pelos princípios de Mayer e pelo framework de Gagné. Ajuste narração e prompt visual segundo o feedback, mantendo ganchos fortes, CTAs em três pontos, ritmo adequado e garantindo que o visual siga regra dos terços, safe zones, contraste ≥4.5:1 e ausência de texto.';

/**
 * Estrutura usada para enviar ao modelo a fotografia atual do slide e o feedback do usuário.
 */
export interface SlideFeedbackPromptContext {
  slide: {
    scriptText: string;
    narrationText: string;
    visualPrompt: string;
  };
  feedback: string;
  targetAudience: Script['targetAudience'];
}

/**
 * Gera a mensagem de usuário do fluxo de feedback.
 * O texto concatena script, narração, prompt visual e instruções de revisão para que o modelo
 * tenha contexto suficiente para responder com um patch completo por slide.
 */
export function buildSlideFeedbackUserPrompt(
  context: SlideFeedbackPromptContext,
): string {
  return `Slide atual:\nSCRIPT:\n${context.slide.scriptText}\n\nTEXTO LITERAL:\n${context.slide.narrationText}\n\nPROMPT VISUAL:\n${context.slide.visualPrompt}\n\nFEEDBACK:\n${context.feedback}\n\nPÚBLICO-ALVO: ${context.targetAudience}`;
}

/**
 * Prompt de sistema do fluxo de edição global.
 * Ele reforça que o modelo só deve tocar nos trechos solicitados, preservando
 * o restante do roteiro e seguindo o guia pedagógico 2025.
 */
export const SLIDE_EDIT_SYSTEM_PROMPT =
  'Você é um lead writer educacional. Faça edições cirúrgicas em roteiros existentes seguindo o guia de ciência cognitiva 2025. Preserve tudo que não for citado e detalhe apenas o necessário.';

/**
 * Parâmetros consolidados que descrevem o contexto de edição de múltiplos slides.
 */
export interface SlideEditPromptContext {
  topic: string;
  targetAudience: Script['targetAudience'];
  materialsExcerpt: string;
  slidesBlock: string;
  instructions: string;
}

/**
 * Monta o prompt de usuário do fluxo de edição global.
 * O texto agrega tema, público, materiais resumidos, lista dos slides atuais e o pedido
 * do usuário, terminando com regras rígidas sobre o formato de resposta esperado.
 */
export function buildSlideEditUserPrompt(
  context: SlideEditPromptContext,
): string {
  return `CONTEXTO DO PROJETO:
- Tópico: ${context.topic}
- Público-alvo: ${context.targetAudience}

MATERIAIS BASE (trecho):
${context.materialsExcerpt}

ROTEIRO ATUAL (ordem e IDs fixos):
${context.slidesBlock}

PEDIDO DO USUÁRIO:
${context.instructions}

INSTRUÇÕES DE EDIÇÃO:
1. Responda apenas com JSON válido no formato slide_edit_plan.
2. Use targetIndex zero-based considerando a ordem após aplicar operações anteriores.
3. Sempre inclua slideId para delete/update.
4. Operações insert DEVEM incluir o campo "slide" completo (scriptText, narrationText, visualPrompt).
5. Priorize edições mínimas; só reconstrua tudo se o usuário pedir explicitamente.
6. Inclua uma "summary" curta explicando o resultado.`;
}

/**
 * Preambulo utilizado por todas as requisições para a API de animações Manim.
 * O texto orienta o modelo a produzir cenas no estilo 3Blue1Brown, descreve ritmo,
 * limites de duração, linguagem visual, tipografia, paleta oficial e regras para labels.
 */
export const MANIM_PROMPT_PREAMBLE = `
Você é o pipeline oficial do estúdio 3Blue1Brown rodando sobre Manim Community Edition 0.19.0.
Crie cenas matemáticas elegantes, com câmera dinâmica, trilhas de escrita contínua e uso criterioso de cor para evidenciar relações.

REGRAS FIXAS:
1. Estruture uma única Scene curta (6–12s) com ritmo claro: introdução com escrita/desenho, transformações intermediárias e destaque final.
2. Gire a câmera suavemente, use move_to/rotate apenas quando agregar narrativa e adicione self.wait(1) ao final para congelar o frame.
3. Prefira planos 2D com NumberPlane, VGroups e animações Write/Create/Transform.
4. Destaque os elementos chave com a paleta 3Blue1Brown (BLUE_E, TEAL_E, GOLD_E, WHITE) + contraste em fundo escuro.
5. Inclua labels legíveis para variáveis/eixos usando MathTex/Text com fontes grandes e fundo transparente.
6. Evite texto narrativo longo; as labels devem ser curtas e matemáticas.
`.trim();
