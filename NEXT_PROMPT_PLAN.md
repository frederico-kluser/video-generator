# Plano de Conversão — Prompt Graph

Este documento inaugura a segunda fase do projeto: vamos remodelar todo o pipeline de geração a partir de um grafo de decisões. Cada caminho leva a prompts exclusivos (texto, imagem, slides, duração, tonalidade) baseados na finalidade escolhida pelo usuário.

## Visão em Árvore (Mermaid)

```mermaid
graph TD
  A[Finalidade do vídeo escolhida pelo usuário]
  A --> B{Tipo de projeto}
  B --> B1[Educacional]
  B --> B2[Propaganda]
  B --> B3[Eventos]
  B --> B4[Guia]
  B --> B5[Review]

  B1 --> C1{Objetivo pedagógico}
  C1 --> C11[Introduzir conceito novo]
  C1 --> C12[Reforçar conhecimento]
  C1 --> C13[Preparar avaliação]

  B2 --> C2{Intenção de marketing}
  C2 --> C21[Lançamento de produto]
  C2 --> C22[Campanha de autoridade]
  C2 --> C23[Conversão direta]

  B3 --> C3{Fase do evento}
  C3 --> C31[Pré-evento teaser]
  C3 --> C32[Cobertura em tempo real]
  C3 --> C33[Pós-evento recap]

  B4 --> C4{Formato do guia}
  C4 --> C41[Passo a passo]
  C4 --> C42[Guia de ferramentas]
  C4 --> C43[Checklist operacional]

  B5 --> C5{Estilo de review}
  C5 --> C51[Análise técnica profunda]
  C5 --> C52[Unboxing / primeiras impressões]
  C5 --> C53[Comparativo com concorrentes]

  C11 --> D1{Componentes educacionais}
  C12 --> D1
  C13 --> D1
  C21 --> D2{Componentes de marketing}
  C22 --> D2
  C23 --> D2
  C31 --> D3{Componentes de evento}
  C32 --> D3
  C33 --> D3
  C41 --> D4{Componentes de guia}
  C42 --> D4
  C43 --> D4
  C51 --> D5{Componentes de review}
  C52 --> D5
  C53 --> D5

  D1 --> E1[Slides 6-10 · Duração 4-7 min]
  D1 --> F1[Prompt textual pedagógico]
  D1 --> G1[Prompt de imagem com espaço para legendas]

  D2 --> E2[Slides 3-5 · Duração 1-2 min]
  D2 --> F2[Prompt textual persuasivo]
  D2 --> G2[Prompt de imagem com foco em produto]

  D3 --> E3[Slides 4-6 · Duração 2-4 min]
  D3 --> F3[Narrativa temporal (antes/durante/depois)]
  D3 --> G3[Visual destacando público, palco e ambientação]

  D4 --> E4[Slides 5-7 · Duração 5-8 min]
  D4 --> F4[Texto instrucional sequencial]
  D4 --> G4[Imagem destacando fluxos e etapas numeradas]

  D5 --> E5[Slides 3-5 · Duração 2-3 min]
  D5 --> F5[Texto analítico com critérios claros]
  D5 --> G5[Imagem com produto, detalhes e notas comparativas]
```

## Combinações e Parametrizações

| Caminho                                  | Características padrões                                              | Resultado esperado                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Educacional → Introduzir conceito        | Slides 8, ritmo moderado, storytelling guiado por problema → solução | Prompt textual enfatiza clareza e scaffolding; prompt de imagem privilegia áreas limpas e diagramas.          |
| Educacional → Reforçar conhecimento      | Slides 6, duração curta, exemplos comparativos                       | Prompts trazem quizzes visuais e chamadas diretas para recap.                                                 |
| Educacional → Preparar avaliação         | Slides 10+, duração maior, checklists                                | Prompts incluem rubricas e contextos de aplicação prática.                                                    |
| Propaganda → Lançamento de produto       | Slides 4, duração curta, CTA final claro                             | Prompts visuais ressaltam hero shot e paleta da marca.                                                        |
| Propaganda → Campanha de autoridade      | Slides 5, ritmo médio, depoimentos                                   | Prompts textuais pedem prova social; imagens destacam figuras humanas.                                        |
| Propaganda → Conversão direta            | Slides 3, duração sub-1 min, urgência                                | Prompts focados em benefício imediato e contraste forte.                                                      |
| Eventos → Pré-evento teaser              | Slides 5, ritmo ascendente, contagem regressiva                      | Prompts alinhados à agenda, reforçando inscrições e informações logísticas.                                   |
| Eventos → Cobertura em tempo real        | Slides 4, cortes rápidos, duração 2-3 min                            | Prompts descrevem destaques do palco, público e bastidores sincronizados a timestamps.                        |
| Eventos → Pós-evento recap               | Slides 6, ritmo retrospectivo, métricas visuais                      | Prompts enfatizam highlights, depoimentos coletados e dados chave para FOMO futuro.                           |
| Guia → Passo a passo detalhado           | Slides 6-7, ritmo linear, checkpoints claros                         | Prompts textuais listam etapas numeradas; imagens apresentam fluxos visuais com ícones funcionais.            |
| Guia → Ferramentas em destaque           | Slides 5, duração 4-6 min, foco em uso de recursos                   | Prompts descrevem painéis, atalhos e estados desejados; imagens mostram interfaces/ferramentas em uso.        |
| Guia → Checklist operacional             | Slides 5, cadência compassada, reforço de regras                     | Prompts enfatizam requisitos, “do/don’t” e alertas; imagens trazem quadros organizados e badges.              |
| Review → Análise técnica profunda        | Slides 5, ritmo ponderado, duração ~3 min                            | Prompts textuais com critérios comparativos e notas; imagens focam em close-ups e especificações.             |
| Review → Unboxing / primeiras impressões | Slides 4, ritmo rápido, emoção inicial                               | Prompts destacam sensações, detalhes do packaging e primeiras reações; imagens mostram sequência de unboxing. |
| Review → Comparativo com concorrentes    | Slides 4-5, estrutura lado a lado, tempo curto                       | Prompts pedem tabelas verbais, prós/contras objetivos; imagens usam gráficos simples e produtos juntos.       |

> Cada linha será originada automaticamente ao cruzarmos o tipo de vídeo e o subobjetivo. A partir daí derivamos parâmetros (contagem de slides, duração-alvo, vocabulário, instruções visuais) e aplicamos filtros adicionais (público, idioma, plataforma).

## Próximos Marcos

1. **Catalogar prompts** específicos surgidos de cada ramo da árvore.
2. **Testar** combinações principais em lote (ex.: Educacional + Conceito Novo para públicos diferentes) e medir resultados.
3. **Adicionar** novas folhas (Eventos, Guia, Review, Treinamentos internos) mantendo o mesmo formato para facilitar auditoria futura.

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

### 3. Eventos

```
Projeto: Vídeos para eventos (pré, durante e pós) que combinam narrativa cronológica com informações logísticas.
Objetivo do prompt: Criar instruções adaptáveis que cubram teasers, cobertura em tempo real e recaps com métricas, garantindo consistência visual e clareza de agenda.
Tarefa: Realize uma pesquisa profunda sobre formatos de comunicação para eventos corporativos e comunitários, considerando: melhores práticas de contagem regressiva, elementos obrigatórios de cobertura (palestrantes, público, bastidores), storytelling pós-evento com dados e depoimentos, e requisitos técnicos para diferentes telas em ambientes ao vivo. Liste referências de marcas e eventos exemplarmente executados.
```

### 4. Guia

```
Projeto: Vídeos-guia que ensinam processos passo a passo, configuram ferramentas ou estabelecem checklists operacionais.
Objetivo do prompt: Elaborar instruções que favoreçam clareza sequencial, checkpoints verificáveis e visuais que reforcem cada etapa.
Tarefa: Realize uma pesquisa profunda sobre formatos de tutorial/guias em vídeo (educacionais, técnicos e corporativos), cobrindo: melhores práticas de segmentação de passos, formas de sinalizar pré-requisitos, uso de sobreposições e callouts visuais, e expectativas de métricas (retenção por etapa, taxa de conclusão). Catalogar exemplos de referência e frameworks adotados por empresas de enablement.
```

### 5. Review

```
Projeto: Vídeos de review (produto, serviço ou conteúdo) que combinam análise crítica e recomendações.
Objetivo do prompt: Definir instruções que equilibrem critérios objetivos, percepções subjetivas e entregas visuais que sustentem credibilidade.
Tarefa: Faça uma pesquisa profunda sobre formatos de review em diferentes plataformas (YouTube longo, Shorts/Reels, blogs em vídeo), contemplando: matrizes de avaliação, dados comparativos, storytelling de unboxing, requisitos de disclosure e melhores práticas de design para destacar especificações. Traga benchmarks e guidelines regulatórias relevantes antes da redação do prompt final.
```

_(Novos tipos serão anexados conforme expandirmos o grafo.)_
