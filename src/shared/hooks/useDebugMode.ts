import { useEffect, useState } from 'react';

const DEBUG_STORAGE_KEY = 'eduscript:debug-mode';
const DEBUG_TRUTHY = new Set(['1', 'true', 'on', 'yes']);

type DebuggableWindow = Window & {
  __EDUSCRIPT_DEBUG__?: boolean;
};

/**
 * Verifica se o debug mode está ativo SOMENTE via parâmetros de URL.
 * Não persiste no localStorage e não verifica localStorage.
 */
function resolveUrlOnlyDebugFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, '?'),
  );

  const searchFlag = searchParams.get('debug');
  const hashFlag = hashParams.get('debug');

  return [searchFlag, hashFlag].some((value) => {
    if (!value) {
      return false;
    }
    return DEBUG_TRUTHY.has(value.toLowerCase());
  });
}

function resolveDebugFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const castedWindow = window as DebuggableWindow;
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, '?'),
  );

  const searchFlag = searchParams.get('debug');
  const hashFlag = hashParams.get('debug');

  // Só verifica a URL, não persiste no localStorage automaticamente
  const foundActiveFlag = [searchFlag, hashFlag].some((value) => {
    if (!value) {
      return false;
    }
    return DEBUG_TRUTHY.has(value.toLowerCase());
  });

  return Boolean(foundActiveFlag || castedWindow.__EDUSCRIPT_DEBUG__);
}

export function useDebugMode() {
  const [isDebugMode, setIsDebugMode] = useState<boolean>(() =>
    resolveDebugFlag(),
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    // Limpa o localStorage se não houver parâmetro debug na URL
    const currentFlag = resolveDebugFlag();
    const storedFlag = window.localStorage?.getItem(DEBUG_STORAGE_KEY);
    if (!currentFlag && storedFlag) {
      window.localStorage?.removeItem(DEBUG_STORAGE_KEY);
    }

    const handleChange = () => {
      setIsDebugMode(resolveDebugFlag());
    };

    handleChange();
    window.addEventListener('popstate', handleChange);
    window.addEventListener('storage', handleChange);

    return () => {
      window.removeEventListener('popstate', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  return isDebugMode;
}

/**
 * Hook que verifica debug mode SOMENTE via URL (query params ou hash).
 * Diferente de useDebugMode, este hook NÃO persiste no localStorage
 * e NÃO lê do localStorage. Útil para funcionalidades que devem
 * aparecer apenas enquanto o parâmetro ?debug=1 está na URL.
 */
export function useUrlOnlyDebugMode() {
  const [isDebugMode, setIsDebugMode] = useState<boolean>(() =>
    resolveUrlOnlyDebugFlag(),
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const handleChange = () => {
      setIsDebugMode(resolveUrlOnlyDebugFlag());
    };

    handleChange();
    window.addEventListener('popstate', handleChange);

    return () => {
      window.removeEventListener('popstate', handleChange);
    };
  }, []);

  return isDebugMode;
}
