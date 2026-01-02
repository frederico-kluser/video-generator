type EnvShape = {
  readonly VITE_API_URL?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_APP_TITLE?: string;
};

const cachedEnv: Partial<{
  apiUrl: string;
  openAiApiKey: string;
  appTitle: string;
}> = {};

export function getEnv() {
  if (!cachedEnv.openAiApiKey) {
    const env = import.meta.env as EnvShape;

    cachedEnv.openAiApiKey = env.VITE_OPENAI_API_KEY ?? '';
    cachedEnv.apiUrl = env.VITE_API_URL ?? '';
    cachedEnv.appTitle = env.VITE_APP_TITLE ?? 'Grava';
  }

  return {
    apiUrl: cachedEnv.apiUrl ?? '',
    openAiApiKey: cachedEnv.openAiApiKey ?? '',
    appTitle: cachedEnv.appTitle ?? 'Grava',
  } as const;
}
