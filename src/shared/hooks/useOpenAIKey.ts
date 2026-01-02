import { useCallback, useEffect, useState } from 'react';
import { appLogger } from '@/shared/logging/logger';

const OPENAI_KEY_STORAGE_KEY = 'grava:openai-api-key';

/**
 * Hook para gerenciar a chave OpenAI do usuário no localStorage.
 * A chave é armazenada localmente e nunca enviada para o backend.
 */
export function useOpenAIKey() {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(OPENAI_KEY_STORAGE_KEY);
  });

  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem(OPENAI_KEY_STORAGE_KEY);
  });

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(OPENAI_KEY_STORAGE_KEY, apiKey);
      appLogger.info('🔑 Chave OpenAI salva no localStorage');
    }
  }, [apiKey]);

  const saveApiKey = useCallback((key: string) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      appLogger.warn('⚠️ Tentativa de salvar chave OpenAI vazia');
      return false;
    }

    if (!trimmedKey.startsWith('sk-')) {
      appLogger.warn('⚠️ Chave OpenAI inválida (deve começar com sk-)');
      return false;
    }

    setApiKey(trimmedKey);
    setIsKeyModalOpen(false);
    return true;
  }, []);

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
    setApiKey(null);
    setIsKeyModalOpen(true);
    appLogger.info('🗑️ Chave OpenAI removida do localStorage');
  }, []);

  const openKeyModal = useCallback(() => {
    setIsKeyModalOpen(true);
  }, []);

  const closeKeyModal = useCallback(() => {
    // Só permite fechar se já tiver uma chave
    if (apiKey) {
      setIsKeyModalOpen(false);
    }
  }, [apiKey]);

  return {
    apiKey,
    hasApiKey: !!apiKey,
    isKeyModalOpen,
    saveApiKey,
    clearApiKey,
    openKeyModal,
    closeKeyModal,
  };
}

/**
 * Função utilitária para obter a chave OpenAI do localStorage.
 * Útil para uso fora de componentes React.
 */
export function getStoredOpenAIKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(OPENAI_KEY_STORAGE_KEY);
}
