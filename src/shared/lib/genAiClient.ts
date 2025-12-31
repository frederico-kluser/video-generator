import { GoogleGenAI } from '@google/genai';
import { getEnv } from '@/config/env';
import { appLogger } from '@/shared/logging/logger';

let client: GoogleGenAI | null = null;

export function getGenAiClient() {
  if (client) {
    return client;
  }

  const { googleApiKey } = getEnv();

  if (!googleApiKey) {
    const message = 'VITE_GOOGLE_AI_KEY está ausente. Configure a variável de ambiente antes de continuar.';
    appLogger.error(message);
    throw new Error(message);
  }

  client = new GoogleGenAI({ apiKey: googleApiKey });
  appLogger.info('Cliente Google GenAI inicializado.');
  return client;
}
