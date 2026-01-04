import { useRecorderLab } from '../../hooks/useRecorderLab';
import { RecorderProfileCard } from '../RecorderProfileCard/RecorderProfileCard';

export function AudioRecorderLabPage() {
  const { profiles, states, startRecording, stopRecording, resetRecording } = useRecorderLab();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="glass-card rounded-3xl p-6 text-white shadow-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-primary-200/80">Laboratório de Áudio</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Comparativo das tecnologias do guia</h1>
        <p className="mt-3 max-w-3xl text-base text-white/70">
          Esta página aplica as receitas detalhadas em <code className="rounded bg-white/10 px-2 py-0.5 text-sm">docs/audio/recorder.md</code>.
          Começamos com a gravação nativa do navegador e, a cada botão, adicionamos as camadas descritas no guia
          (chain Web Audio, extendable-media-recorder, noise gate, RNNoise e VAD). Grave algo em cada perfil e use o
          preview embutido para comparar o resultado.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {profiles.map((profile) => (
          <RecorderProfileCard
            key={profile.id}
            profile={profile}
            state={states[profile.id]}
            onStart={() => startRecording(profile.id)}
            onStop={() => stopRecording(profile.id)}
            onReset={() => resetRecording(profile.id)}
          />
        ))}
      </section>
    </main>
  );
}
