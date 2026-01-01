import { useEffect, useMemo, useState } from 'react';

import JSZip from 'jszip';
import {
  FileWarning,
  ImageIcon,
  Music,
  RefreshCcw,
  Upload,
} from 'lucide-react';

import type {
  RenderBundleManifest,
  RenderBundleSlide,
} from '@/features/render-test/model/renderBundle';
import { appLogger } from '@/shared/logging/logger';
import { WebAVRenderer } from '@/features/video-generation/components/PreviewStep/WebAVRenderer';
import type { WebAVRendererSlideInput } from '@/shared/types/webav.types';

const IMAGE_DIR = 'assets/images/';
const AUDIO_DIR = 'assets/audio/';

type SlidePreview = {
  slide: RenderBundleSlide;
  imageUrl?: string;
  audioUrl?: string;
};

export function RenderTestPage() {
  const [manifest, setManifest] = useState<RenderBundleManifest | null>(null);
  const [slidesPreview, setSlidesPreview] = useState<SlidePreview[]>([]);
  const [status, setStatus] = useState(
    'Envie um bundle .zip ou manifest.json para iniciar.',
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isWebAVRendering, setIsWebAVRendering] = useState(false);

  useEffect(() => {
    return () => {
      cleanupPreviewAssets(slidesPreview);
    };
  }, [slidesPreview]);

  const orderedSlides = useMemo(() => {
    return [...slidesPreview].sort((a, b) => a.slide.order - b.slide.order);
  }, [slidesPreview]);
  const renderAspectRatio = manifest?.aspectRatio ?? '16:9';
  const webAvSlides = useMemo<WebAVRendererSlideInput[]>(() => {
    return orderedSlides.map((entry, index) => ({
      id: entry.slide.id,
      order: entry.slide.order ?? index,
      imageUrl: entry.imageUrl,
      audioUrl: entry.audioUrl,
      zIndex: 1,
    }));
  }, [orderedSlides]);

  const handleFileSelection = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    await processFile(file);
    event.target.value = '';
  };

  const processFile = async (file: File) => {
    cleanupPreviewAssets(slidesPreview);
     setIsWebAVRendering(false);
    setIsLoading(true);
    setStatus('Carregando bundle...');

    try {
      if (file.name.endsWith('.zip')) {
        await loadZipBundle(file);
      } else {
        await loadManifest(file);
      }
    } catch (error) {
      appLogger.error('💥 Falha ao carregar render bundle.', { error });
      window.alert(
        'Não foi possível carregar o arquivo. Consulte o console para detalhes.',
      );
      setManifest(null);
      setSlidesPreview([]);
      setStatus('Envie um bundle válido para continuar.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadManifest = async (file: File) => {
    const text = await file.text();
    const parsed = parseManifest(text);
    setManifest(parsed);
    setSlidesPreview(parsed.slides.map((slide) => ({ slide })));
    setStatus(
      `Manifesto carregado: ${parsed.slides.length} slides (sem assets).`,
    );
    appLogger.info('📝 Manifesto JSON carregado para render-test.', {
      slides: parsed.slides.length,
    });
  };

  const loadZipBundle = async (file: File) => {
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest.json');

    if (!manifestFile) {
      throw new Error('manifest.json não encontrado no bundle.');
    }

    const parsed = parseManifest(await manifestFile.async('text'));
    const previews: SlidePreview[] = [];

    for (const slide of parsed.slides) {
      const preview: SlidePreview = { slide };

      if (slide.imageFile) {
        const imageEntry = zip.file(`${IMAGE_DIR}${slide.imageFile}`);
        if (imageEntry) {
          const blob = await imageEntry.async('blob');
          preview.imageUrl = URL.createObjectURL(blob);
        }
      }

      if (slide.audioFile) {
        const audioEntry = zip.file(`${AUDIO_DIR}${slide.audioFile}`);
        if (audioEntry) {
          const blob = await audioEntry.async('blob');
          preview.audioUrl = URL.createObjectURL(blob);
        }
      }

      previews.push(preview);
    }

    setManifest(parsed);
    setSlidesPreview(previews);
    setStatus(`Bundle carregado com ${parsed.slides.length} slides.`);

    appLogger.info('🧪 Bundle de renderização carregado.', {
      slides: parsed.slides.length,
    });
  };

  const handleReset = () => {
    cleanupPreviewAssets(slidesPreview);
    setIsWebAVRendering(false);
    setManifest(null);
    setSlidesPreview([]);
    setStatus('Envie um bundle .zip ou manifest.json para iniciar.');
  };

  return (
    <div className="min-h-screen bg-dark-950 px-6 py-10 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="rounded-3xl border border-dark-700 bg-dark-900/80 p-8 shadow-2xl shadow-primary-500/10">
          <p className="mb-2 text-xs uppercase tracking-[0.4em] text-white/50">
            render-test/
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Teste de renderização offline
          </h1>
          <p className="mt-2 text-white/70">
            Faça upload de um bundle exportado pelo fluxo principal para
            inspecionar scripts, imagens e áudios antes de passar pelo
            renderizador final.
          </p>
        </header>

        <section className="rounded-3xl border border-dashed border-primary-500/30 bg-dark-900/60 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/50">
                Status
              </p>
              <p className="text-lg font-semibold text-white">{status}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="btn-primary inline-flex cursor-pointer items-center gap-2">
                <Upload className="h-4 w-4" />
                <span>Carregar bundle</span>
                <input
                  type="file"
                  accept=".zip,.json"
                  className="hidden"
                  onChange={handleFileSelection}
                  disabled={isLoading}
                />
              </label>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleReset}
                disabled={isLoading && slidesPreview.length === 0}
              >
                <RefreshCcw className="h-4 w-4" /> Limpar
              </button>
            </div>
          </div>
        </section>

        {orderedSlides.length > 0 && (
          <section className="rounded-3xl border border-dark-800 bg-dark-900/70 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-white/50">
                  Renderização WebAV
                </p>
                <p className="text-white/70">
                  Gere o MP4 final usando o mesmo pipeline acelerado por GPU da etapa de preview.
                </p>
              </div>
              <WebAVRenderer
                slides={webAvSlides}
                aspectRatio={renderAspectRatio}
                isRendering={isWebAVRendering}
                onRenderStart={() => setIsWebAVRendering(true)}
                onRenderComplete={() => setIsWebAVRendering(false)}
                onRenderError={(error) => {
                  setIsWebAVRendering(false);
                  window.alert(
                    `Falha ao renderizar bundle com WebAV: ${error.message}`,
                  );
                }}
              />
            </div>
          </section>
        )}

        {isLoading && (
          <div className="rounded-3xl border border-dark-700 bg-dark-900/70 p-6 text-white/70">
            Processando arquivo...
          </div>
        )}

        {!isLoading && orderedSlides.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dark-800 bg-dark-900/50 p-10 text-center text-white/60">
            <FileWarning className="h-12 w-12" />
            <p>Nenhum slide carregado ainda.</p>
          </div>
        )}

        {orderedSlides.length > 0 && (
          <section className="space-y-4">
            {orderedSlides.map((entry, index) => (
              <article
                key={entry.slide.id}
                className="rounded-2xl border border-dark-800 bg-dark-900/70 p-5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-white/40">
                      Slide {index + 1}
                    </p>
                    <h2 className="text-xl font-semibold text-white">
                      {entry.slide.scriptText.slice(0, 64) ||
                        'Slide sem título'}
                    </h2>
                  </div>
                  <div className="text-sm text-white/50">
                    Prompt visual: {entry.slide.visualPrompt.slice(0, 40)}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.3em] text-white/40">
                      Texto narrado
                    </p>
                    <p className="rounded-2xl border border-dark-700 bg-dark-950/60 p-4 text-sm text-white/80">
                      {entry.slide.narrationText || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.3em] text-white/40">
                      Texto orientativo
                    </p>
                    <p className="rounded-2xl border border-dark-700 bg-dark-950/60 p-4 text-sm text-white/80">
                      {entry.slide.scriptText || '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Imagem
                    </p>
                    {entry.imageUrl ? (
                      <img
                        src={entry.imageUrl}
                        alt={`Slide ${index + 1}`}
                        className="rounded-xl border border-dark-700 object-cover"
                      />
                    ) : (
                      <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dark-700 text-white/40">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Áudio
                    </p>
                    {entry.audioUrl ? (
                      <audio controls src={entry.audioUrl} className="w-full" />
                    ) : (
                      <div className="flex min-h-[80px] items-center justify-center rounded-xl border border-dark-700 text-white/40">
                        <Music className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function cleanupPreviewAssets(entries: SlidePreview[]) {
  entries.forEach((entry) => {
    if (entry.imageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(entry.imageUrl);
    }
    if (entry.audioUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(entry.audioUrl);
    }
  });
}

function parseManifest(text: string): RenderBundleManifest {
  const parsed = JSON.parse(text) as RenderBundleManifest;
  if (parsed.schemaVersion !== 1) {
    throw new Error('Schema incompatível para render bundle.');
  }
  return parsed;
}
