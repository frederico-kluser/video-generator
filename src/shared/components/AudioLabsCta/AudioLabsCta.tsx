import { ArrowRight } from 'lucide-react';

type AudioLabId = 'cleanup' | 'equalizer' | 'render';

type AudioLabsCtaProps = {
  current?: AudioLabId;
};

const LAB_LINKS: Array<{
  id: AudioLabId;
  title: string;
  description: string;
  href: string;
  badge: string;
}> = [
  {
    id: 'cleanup',
    title: 'Audio Cleanup Lab',
    description:
      'Sherpa-ONNX + arnndn remotos para testar a cadeia de limpeza.',
    href: '/audio-lab',
    badge: 'Limpeza',
  },
  {
    id: 'equalizer',
    title: 'Audio Equalizer Lab',
    description: 'Monte takes sequenciais e aplique shelves + peaking.',
    href: '/audio-eq-lab',
    badge: 'Equalizacao',
  },
  {
    id: 'render',
    title: 'Render Test Lab',
    description: 'Teste o sistema de renderização de vídeo com WebAV.',
    href: '/render-test',
    badge: 'Render',
  },
];

export function AudioLabsCta({ current }: AudioLabsCtaProps) {
  return (
    <div className="glass-card flex flex-col gap-4 rounded-3xl border border-white/5 bg-dark-900/80 p-6 text-white">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">
          Laboratorios de audio
        </p>
        <h2 className="text-2xl font-semibold text-white">
          Continue experimentando
        </h2>
        <p className="text-sm text-white/70">
          Navegue rapidamente entre os dois ambientes de voz para comparar
          limpeza e equalizacao antes de produzir o roteiro final.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {LAB_LINKS.map((lab) => {
          const isActive = current === lab.id;
          return (
            <a
              key={lab.id}
              href={lab.href}
              className={`group flex flex-col rounded-2xl border px-5 py-4 transition hover:-translate-y-0.5 ${
                isActive
                  ? 'border-primary-400/60 bg-primary-500/10'
                  : 'border-white/10 bg-white/5 hover:border-white/30'
              }`}
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/50">
                <span>{lab.badge}</span>
                <ArrowRight
                  size={16}
                  className="transition group-hover:translate-x-1"
                />
              </div>
              <h3 className="mt-3 text-xl font-semibold text-white">
                {lab.title}
              </h3>
              <p className="text-sm text-white/70">{lab.description}</p>
              {isActive && (
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary-500/20 px-3 py-1 text-xs font-semibold text-primary-200">
                  Em uso
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
