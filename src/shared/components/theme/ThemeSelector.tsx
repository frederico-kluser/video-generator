import { Palette } from 'lucide-react';

import { useTheme } from '@/shared/theme/ThemeProvider';

export function ThemeSelector() {
  const { theme, definitions, setTheme } = useTheme();

  return (
    <div className="glass-card flex w-full max-w-xs flex-col gap-3 rounded-2xl border border-white/10 p-4 shadow-glow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
        <Palette size={16} className="text-primary-300" />
        Tema visual
      </div>
      <div className="flex flex-col gap-2">
        {definitions.map((definition) => {
          const isActive = definition.id === theme;
          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => setTheme(definition.id)}
              aria-pressed={isActive}
              className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                isActive
                  ? 'border-primary-500 bg-primary-500/10 shadow-glow-sm'
                  : 'border-white/5 bg-white/5 text-white/70 hover:border-white/20'
              }`}
            >
              <div>
                <div className="text-sm font-semibold text-white">
                  {definition.label}
                </div>
                <p className="text-xs text-white/70">
                  {definition.description}
                </p>
              </div>
              <span
                aria-hidden
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r ${definition.accentGradient}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
