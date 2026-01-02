type EnvShape = {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_TITLE?: string;
};

const cachedEnv: Partial<{
  apiUrl: string;
  appTitle: string;
}> = {};

export function getEnv() {
  if (!cachedEnv.appTitle) {
    const env = import.meta.env as EnvShape;

    cachedEnv.apiUrl = env.VITE_API_URL ?? '';
    cachedEnv.appTitle = env.VITE_APP_TITLE ?? 'Grava';
  }

  return {
    apiUrl: cachedEnv.apiUrl ?? '',
    appTitle: cachedEnv.appTitle ?? 'Grava',
  } as const;
}
