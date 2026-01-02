export type ThemeId = 'default';

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  description: string;
};

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'default',
    label: 'Grava',
    description: 'Tema padrão do Grava.',
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'default';

const themeMap = new Map(THEME_DEFINITIONS.map((theme) => [theme.id, theme]));

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && themeMap.has(value as ThemeId);

export const getThemeDefinition = (themeId?: ThemeId): ThemeDefinition =>
  themeMap.get(themeId ?? DEFAULT_THEME_ID) ?? themeMap.get(DEFAULT_THEME_ID)!;
