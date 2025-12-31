import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DEFAULT_THEME_ID,
  getThemeDefinition,
  isThemeId,
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
const STORAGE_KEY = 'eduscript:theme';

const getInitialTheme = (): ThemeId => {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_ID;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && isThemeId(stored)) {
    return stored;
  }

  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'aurora';
  }

  return DEFAULT_THEME_ID;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(getInitialTheme);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme]);

  const setTheme = useCallback((nextTheme: ThemeId) => {
    setThemeState(nextTheme);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    return {
      theme,
      definition: getThemeDefinition(theme),
      definitions: THEME_DEFINITIONS,
      setTheme,
    };
  }, [setTheme, theme]);

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
