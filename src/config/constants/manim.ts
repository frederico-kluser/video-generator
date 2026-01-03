import type { AspectRatio } from '@/config/constants/video';

const FALLBACK_BASE_URL = 'http://localhost:8000';

const resolveBaseUrl = (): string => {
  const viteEnv = import.meta.env?.VITE_MANIM_API_BASE_URL;
  if (viteEnv) {
    return viteEnv;
  }

  if (typeof process !== 'undefined' && process.env?.VITE_MANIM_API_BASE_URL) {
    return process.env.VITE_MANIM_API_BASE_URL;
  }

  return FALLBACK_BASE_URL;
};

export const MANIM_API_BASE_URL = resolveBaseUrl();

export const MANIM_RESOLUTION_BY_ASPECT_RATIO: Record<
  AspectRatio,
  { width: number; height: number }
> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};

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
