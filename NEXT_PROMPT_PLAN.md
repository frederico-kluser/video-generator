# Plano de Conversão — Prompt Graph

Este documento inaugura a segunda fase do projeto: vamos remodelar todo o pipeline de geração a partir de um grafo de decisões. Cada caminho leva a prompts exclusivos (texto, imagem, slides, duração, tonalidade) baseados na finalidade escolhida pelo usuário.

## Visão em Árvore (Mermaid)

```mermaid
graph TD
  A[Finalidade do vídeo escolhida pelo usuário]
  A --> B{Tipo de projeto}
  B --> B1[Educacional]
  B --> B2[Propaganda]
  B --> B3[Futuro: Evento / Testemunho]

  B1 --> C1{Objetivo pedagógico}
  C1 --> C11[Introduzir conceito novo]
  C1 --> C12[Reforçar conhecimento]
  C1 --> C13[Preparar avaliação]

  B2 --> C2{Intenção de marketing}
  C2 --> C21[Lançamento de produto]
  C2 --> C22[Campanha de autoridade]
  C2 --> C23[Conversão direta]

  C11 --> D1{Componentes}
  C12 --> D1
  C13 --> D1
  C21 --> D2{Componentes}
  C22 --> D2
  C23 --> D2

  D1 --> E1[Slides: 6-10 | Duração: 4-7 min]
  D1 --> F1[Prompt textual pedagógico]
  D1 --> G1[Prompt de imagem com espaço para legendas]

  D2 --> E2[Slides: 3-5 | Duração: 1-2 min]
  D2 --> F2[Prompt textual persuasivo]
  D2 --> G2[Prompt de imagem com foco em produto]
```

## Combinações e Parametrizações

| Caminho                             | Características padrões                                              | Resultado esperado                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Educacional → Introduzir conceito   | Slides 8, ritmo moderado, storytelling guiado por problema → solução | Prompt textual enfatiza clareza e scaffolding; prompt de imagem privilegia áreas limpas e diagramas. |
| Educacional → Reforçar conhecimento | Slides 6, duração curta, exemplos comparativos                       | Prompts trazem quizzes visuais e chamadas diretas para recap.                                        |
| Educacional → Preparar avaliação    | Slides 10+, duração maior, checklists                                | Prompts incluem rubricas e contextos de aplicação prática.                                           |
| Propaganda → Lançamento de produto  | Slides 4, duração curta, CTA final claro                             | Prompts visuais ressaltam hero shot e paleta da marca.                                               |
| Propaganda → Campanha de autoridade | Slides 5, ritmo médio, depoimentos                                   | Prompts textuais pedem prova social; imagens destacam figuras humanas.                               |
| Propaganda → Conversão direta       | Slides 3, duração sub-1 min, urgência                                | Prompts focados em benefício imediato e contraste forte.                                             |

> Cada linha será originada automaticamente ao cruzarmos o tipo de vídeo e o subobjetivo. A partir daí derivamos parâmetros (contagem de slides, duração-alvo, vocabulário, instruções visuais) e aplicamos filtros adicionais (público, idioma, plataforma).

## Próximos Marcos

1. **Catalogar prompts** específicos surgidos de cada ramo da árvore.
2. **Testar** combinações principais em lote (ex.: Educacional + Conceito Novo para públicos diferentes) e medir resultados.
3. **Adicionar** novas folhas (Eventos, Testemunhos, Treinamentos internos) mantendo o mesmo formato para facilitar auditoria futura.

## Briefs de Pesquisa Profunda por Finalidade

Cada prompt abaixo descreve o objetivo da investigação que precisamos realizar antes de desenhar os prompts definitivos de geração. O pesquisador deve retornar insights, requisitos e exemplos concretos.

### 1. Educacional

```
Projeto: Vídeos educacionais baseados em slides narrados.
Objetivo do prompt: Construir instruções completas para geração de roteiro, imagens e assets visuais voltados a ensino formal.
Tarefa: Realize uma pesquisa profunda sobre boas práticas pedagógicas audiovisuais, considerando níveis de ensino, gradação de dificuldade, espaço para legendas, formatos de avaliação e referências visuais que favoreçam retenção. Liste fontes, frameworks e métricas a observar antes de escrever qualquer prompt.
```

### 2. Propaganda

```
Projeto: Vídeos de propaganda orientados a conversão rápida.
Objetivo do prompt: Definir instruções que equilibrem storytelling de marca, posicionamento de produto e chamadas para ação eficientes.
Tarefa: Faça uma pesquisa profunda sobre tendências atuais de vídeo marketing em plataformas curtas e longas, abordando construção de autoridade, CTAs mensuráveis, design visual centrado no produto e limitações de tempo. Registre benchmarks e dados que devem fundamentar o prompt final.
```

_(Novos tipos serão anexados conforme expandirmos o grafo.)_
