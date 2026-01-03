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
    <div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-dark-900/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {LAB_LINKS.map((lab) => {
          const isActive = current === lab.id;
          return (
            <a
              key={lab.id}
              href={lab.href}
              className={`group inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-white/5 ${
                isActive
                  ? 'border-primary-400/60 bg-primary-500/10 text-primary-200'
                  : 'border-white/10 text-white/70 hover:border-white/20 hover:text-white'
              }`}
            >
              <span>{lab.title}</span>
              <ArrowRight
                size={12}
                className="opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100"
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}
