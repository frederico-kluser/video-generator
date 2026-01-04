import { useMemo } from 'react';

import { ArrowRight } from 'lucide-react';

type AudioLabId =
  | 'audioJoin'
  | 'audioRecorder'
  | 'audioSilence'
  | 'audioSplit'
  | 'render'
  | 'threeBlueOneBrown';

type AudioLabsCtaProps = {
  current?: AudioLabId;
  onOpenVideoTester?: () => void;
};

type LabEntry = {
  id: AudioLabId;
  title: string;
  description: string;
  badge: string;
  href?: string;
  action?: () => void;
};

const BASE_LABS: LabEntry[] = [
  {
    id: 'audioJoin',
    title: 'Join de Áudio (Crunker)',
    description: 'Grave dois takes e una tudo em um WAV local.',
    href: '/audio/join',
    badge: 'Join',
  },
  {
    id: 'audioRecorder',
    title: 'Recorder Lab (Pilhas)',
    description: 'Compare pipelines com RNNoise, Noise Gate e Extendable Recorder.',
    href: '/audio/recorder-lab',
    badge: 'Recorder',
  },
  {
    id: 'audioSilence',
    title: 'Detector de Silêncio (Silero)',
    description: 'Grave e anote os trechos sem fala usando @ricky0123/vad-web.',
    href: '/audio-silence',
    badge: 'Silêncio',
  },
  {
    id: 'audioSplit',
    title: 'Audio Split Playground',
    description: 'Grave e faça splits com slider limitado ao tempo total.',
    href: '/audio-split',
    badge: 'Split',
  },
  {
    id: 'render',
    title: 'Renderização WebAV (Debug)',
    description: 'Teste o encoder WebAV/FFmpeg antes do envio para cloud.',
    href: '/render-test',
    badge: 'Render',
  },
];

export function AudioLabsCta({ current, onOpenVideoTester }: AudioLabsCtaProps) {
  const labs: LabEntry[] = useMemo(() => {
    if (!onOpenVideoTester) {
      return BASE_LABS;
    }

    return [
      ...BASE_LABS,
      {
        id: 'threeBlueOneBrown',
        title: 'Teste API 3Blue1Brown',
        description: 'Executa apenas o renderizador matemático e verifica o payload da API.',
        badge: '3B1B',
        action: onOpenVideoTester,
      },
    ];
  }, [onOpenVideoTester]);

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-white/10 bg-dark-900/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {labs.map((lab) => {
          const isActive = current === lab.id;
          const className = `group inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs text-left font-medium transition hover:bg-white/5 ${
            isActive
              ? 'border-primary-400/60 bg-primary-500/10 text-primary-200'
              : 'border-white/10 text-white/80 hover:border-white/20 hover:text-white'
          }`;

          const content = (
            <>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                  {lab.badge}
                </span>
                <span>{lab.title}</span>
                <span className="text-[10px] text-white/60">{lab.description}</span>
              </div>
              <ArrowRight
                size={12}
                className="opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100"
              />
            </>
          );

          if (lab.href) {
            return (
              <a key={lab.id} href={lab.href} className={className}>
                {content}
              </a>
            );
          }

          return (
            <button
              key={lab.id}
              type="button"
              onClick={lab.action}
              className={className}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
