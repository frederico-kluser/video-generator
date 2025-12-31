import { useActionState, useState } from 'react';
import { BookOpen, LayoutTemplate, Video } from 'lucide-react';
import { AspectRatio, VIDEO_CONFIG } from '@/config/constants/video';
import { VideoGenerationPayload } from '@/features/video-generation/model/types';

const AUDIENCE_OPTIONS = [
  'Elementary School (K-5)',
  'High School (6-12)',
  'University / Adult',
  'General Public',
];

type InputStepProps = {
  onStart: (data: VideoGenerationPayload) => Promise<void>;
};

export function InputStep({ onStart }: InputStepProps) {
  const [topic, setTopic] = useState('');
  const [materials, setMaterials] = useState('');
  const [audience, setAudience] = useState(VIDEO_CONFIG.DEFAULT_AUDIENCE);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(VIDEO_CONFIG.DEFAULT_ASPECT_RATIO);

  const [actionError, startAction, isPending] = useActionState(async (_: string | null, formData: FormData) => {
    const payload: VideoGenerationPayload = {
      topic: String(formData.get('topic') ?? '').trim(),
      materials: String(formData.get('materials') ?? '').trim(),
      targetAudience: String(formData.get('audience') ?? VIDEO_CONFIG.DEFAULT_AUDIENCE),
      aspectRatio: formData.get('aspectRatio') as AspectRatio,
    };

    if (!payload.topic || !payload.materials) {
      return 'Informe um tópico e materiais de referência para continuar.';
    }

    try {
      await onStart(payload);
      return null;
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      }
      return 'Não foi possível iniciar a geração. Tente novamente.';
    }
  }, null);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-6 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white">EduScript AI</h1>
          <p className="text-gray-400">Transforme suas anotações em videoaulas memoráveis.</p>
        </div>

        {actionError && (
          <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-200">
            {actionError}
          </div>
        )}

        <form action={startAction} className="space-y-6">
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-300" htmlFor="topic">
              <BookOpen size={16} /> Qual é o tópico principal?
            </label>
            <input
              id="topic"
              name="topic"
              type="text"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex.: Teorema de Pitágoras"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-2 text-sm font-medium text-gray-300" htmlFor="audience">
              Público-alvo
            </label>
            <select
              id="audience"
              name="audience"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
            >
              {AUDIENCE_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 text-sm font-medium text-gray-300" htmlFor="materials">
              Materiais ou notas de referência
            </label>
            <textarea
              id="materials"
              name="materials"
              className="h-32 w-full resize-none rounded-lg border border-gray-700 bg-gray-950 p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Cole textos, tópicos ou transcrições..."
              value={materials}
              onChange={(event) => setMaterials(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-300">
              <LayoutTemplate size={16} /> Formato do vídeo
            </label>
            <div className="grid grid-cols-3 gap-4">
              {[
                { id: '9:16' as AspectRatio, label: 'Shorts/TikTok' },
                { id: '16:9' as AspectRatio, label: 'YouTube' },
                { id: '1:1' as AspectRatio, label: 'Post quadrado' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-sm transition-all ${
                    aspectRatio === option.id
                      ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                      : 'border-gray-800 bg-gray-950 text-gray-400 hover:border-gray-600'
                  }`}
                  onClick={() => setAspectRatio(option.id)}
                >
                  <span className="rounded bg-gray-800 px-2 py-1 font-mono text-xs font-bold">{option.id}</span>
                  {option.label}
                </button>
              ))}
            </div>
            <input type="hidden" name="aspectRatio" value={aspectRatio} />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            <Video className={isPending ? 'animate-pulse' : ''} />
            {isPending ? 'Gerando...' : 'Gerar roteiro e slides'}
          </button>
        </form>
      </div>
    </div>
  );
}
