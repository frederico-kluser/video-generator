import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from 'react';

import {
  DEFAULT_THEME_ID,
  getThemeDefinition,
  THEME_DEFINITIONS,
  type ThemeDefinition,
  type ThemeId,
} from './themeDefinitions';

type ThemeContextValue = {
  theme: ThemeId;
  definition: ThemeDefinition;
  definitions: ThemeDefinition[];
  setTheme: (theme: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const noop = () => {};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme: ThemeId = DEFAULT_THEME_ID;

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => {
    return {
      theme,
      definition: getThemeDefinition(theme),
      definitions: THEME_DEFINITIONS,
      setTheme: noop,
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider.');
  }

  return context;
}
