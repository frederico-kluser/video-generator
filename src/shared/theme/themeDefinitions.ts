export type ThemeId = 'midnight' | 'aurora' | 'solstice';

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  description: string;
  accentGradient: string;
};

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'midnight',
    label: 'Midnight Studio',
    description: 'Roxos profundos com glow violeta clássico do EduScript.',
    accentGradient: 'from-primary-600 via-primary-500 to-accent-500',
  },
  {
    id: 'aurora',
    label: 'Aurora Lab',
    description: 'Teal + magenta inspirados em auroras boreais.',
    accentGradient: 'from-accent-500 via-primary-500 to-accent-700',
  },
  {
    id: 'solstice',
    label: 'Solstice Studio',
    description: 'Âmbares quentes com acentos rosados.',
    accentGradient: 'from-primary-500 via-accent-500 to-primary-600',
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'midnight';

const themeMap = new Map(THEME_DEFINITIONS.map((theme) => [theme.id, theme]));

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && themeMap.has(value as ThemeId);

export const getThemeDefinition = (themeId?: ThemeId): ThemeDefinition =>
  themeMap.get(themeId ?? DEFAULT_THEME_ID) ?? themeMap.get(DEFAULT_THEME_ID)!;
