import { useEffect, useState } from 'react';

const DEBUG_STORAGE_KEY = 'eduscript:debug-mode';
const DEBUG_TRUTHY = new Set(['1', 'true', 'on', 'yes']);

type DebuggableWindow = Window & {
  __EDUSCRIPT_DEBUG__?: boolean;
};

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
  const storedFlag = window.localStorage?.getItem(DEBUG_STORAGE_KEY);

  const foundActiveFlag = [searchFlag, hashFlag, storedFlag].some((value) => {
    if (!value) {
      return false;
    }
    return DEBUG_TRUTHY.has(value.toLowerCase());
  });

  if (searchFlag && DEBUG_TRUTHY.has(searchFlag.toLowerCase())) {
    window.localStorage?.setItem(DEBUG_STORAGE_KEY, 'true');
  }

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
