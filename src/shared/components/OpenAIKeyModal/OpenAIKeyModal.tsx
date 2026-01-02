import { useState, useRef, useEffect } from 'react';
import { Key, X, AlertCircle } from 'lucide-react';

type OpenAIKeyModalProps = {
  isOpen: boolean;
  onSave: (key: string) => boolean;
  onClose: () => void;
  canClose: boolean;
};

export function OpenAIKeyModal({
  isOpen,
  onSave,
  onClose,
  canClose,
}: OpenAIKeyModalProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSave = () => {
    setError(null);

    if (!key.trim()) {
      setError('Por favor, insira uma chave válida');
      return;
    }

    if (!key.startsWith('sk-')) {
      setError('A chave deve começar com "sk-"');
      return;
    }

    const success = onSave(key);
    if (success) {
      setKey('');
      setError(null);
    } else {
      setError('Não foi possível salvar a chave. Verifique se ela é válida.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape' && canClose) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-dark-900 p-6 shadow-2xl">
        {canClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        )}

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600">
            <Key size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Chave OpenAI</h2>
            <p className="text-sm text-white/60">Configure sua API key</p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-accent-500/20 bg-accent-500/5 p-4">
          <div className="mb-2 flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-accent-400" />
            <div className="text-sm text-white/80">
              <p className="mb-2 font-medium">Por que preciso de uma chave?</p>
              <p className="text-white/60">
                O Grava usa a API da OpenAI para gerar roteiros e imagens. Sua
                chave fica armazenada apenas no seu navegador e nunca é enviada
                para nossos servidores.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label
            htmlFor="openai-key"
            className="mb-2 block text-sm font-medium text-white/80"
          >
            Chave da API OpenAI
          </label>
          <input
            ref={inputRef}
            id="openai-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="sk-..."
            className="w-full rounded-lg border border-white/10 bg-dark-800 px-4 py-3 font-mono text-sm text-white placeholder-white/30 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
        </div>

        <div className="mb-4 text-xs text-white/40">
          Não tem uma chave?{' '}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 underline hover:text-primary-300"
          >
            Crie uma no OpenAI
          </a>
        </div>

        <div className="flex gap-3">
          {canClose && (
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-medium text-white/80 transition-colors hover:bg-white/10"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg bg-primary-600 px-4 py-3 font-medium text-white transition-all hover:bg-primary-500"
          >
            Salvar chave
          </button>
        </div>
      </div>
    </div>
  );
}
