type EnvShape = {
  readonly VITE_API_URL?: string;
  readonly VITE_GOOGLE_AI_KEY?: string;
  readonly VITE_APP_TITLE?: string;
};

const cachedEnv: Partial<{ apiUrl: string; googleApiKey: string; appTitle: string }> = {};

export function getEnv() {
  if (!cachedEnv.googleApiKey) {
    const env = import.meta.env as EnvShape;

    cachedEnv.googleApiKey = env.VITE_GOOGLE_AI_KEY ?? '';
    cachedEnv.apiUrl = env.VITE_API_URL ?? '';
    cachedEnv.appTitle = env.VITE_APP_TITLE ?? 'EduScript AI';
  }

  return {
    apiUrl: cachedEnv.apiUrl ?? '',
    googleApiKey: cachedEnv.googleApiKey ?? '',
    appTitle: cachedEnv.appTitle ?? 'EduScript AI',
  } as const;
}
