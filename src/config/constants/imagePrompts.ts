export const COMPOSITION_GUIDES = {
  '16:9': `
Composição cinematográfica horizontal widescreen.
Sujeito posicionado usando regra dos terços, levemente à direita do centro.
Espaço negativo generoso na parte inferior (20%) para legendas.
Enquadramento panorâmico com sensação de profundidade.
`.trim(),
  '9:16': `
Composição vertical estilo stories.
Sujeito centralizado verticalmente ocupando o terço central da altura.
Espaço negativo na parte superior e inferior para UI e legendas.
Enquadramento estreito e imersivo que transmite altura.
`.trim(),
  '1:1': `
Composição quadrada equilibrada e centralizada.
Sujeito principal no centro absoluto da imagem.
Elementos simétricos ao redor quando fizer sentido.
Bordas limpas para permitir crop flexível em qualquer direção.
`.trim(),
} as const;

export const SAFE_ZONE_INSTRUCTIONS = {
  '16:9':
    'Mantenha elementos importantes dentro dos 70% centrais no eixo horizontal.',
  '9:16':
    'Mantenha elementos importantes dentro dos 70% centrais no eixo vertical.',
  '1:1':
    'Mantenha elementos importantes dentro dos 80% centrais em ambos os eixos.',
} as const;

export const SUBTITLE_SPACE_INSTRUCTIONS = {
  '16:9':
    'Reserve os 20% inferiores com gradiente sutil escurecendo para acomodar legendas.',
  '9:16':
    'Reserve os 15% inferiores para legendas e elementos de interface dos apps.',
  '1:1':
    'Reserve uma faixa inferior de 20% com transição suave para texto adicional.',
} as const;
