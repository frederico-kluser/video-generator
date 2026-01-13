import { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Video } from 'lucide-react';

import { Button } from '@/shared/components/ui/Button';
import { LabAlert } from '@/shared/components/ui/LabAlert';
import { LabCard } from '@/shared/components/ui/LabCard';
import { LabPageLayout } from '@/shared/components/ui/LabPageLayout';

interface AudioTrack {
  id: string;
  file: File;
  name: string;
  url: string;
  duration: number;
}

interface TrackTimestamp {
  trackIndex: number;
  trackName: string;
  startTime: number;
  endTime: number;
}

export function LofiVideoLab() {
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackTimestamps, setTrackTimestamps] = useState<TrackTimestamp[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlsRef = useRef<string[]>([]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  // Calculate timestamps when audio tracks change
  useEffect(() => {
    if (audioTracks.length === 0) {
      setTrackTimestamps([]);
      return;
    }

    const timestamps: TrackTimestamp[] = [];
    let accumulatedTime = 0;

    audioTracks.forEach((track, index) => {
      timestamps.push({
        trackIndex: index,
        trackName: track.name,
        startTime: accumulatedTime,
        endTime: accumulatedTime + track.duration,
      });
      accumulatedTime += track.duration;
    });

    setTrackTimestamps(timestamps);
    console.log('Track timestamps calculated:', timestamps);
  }, [audioTracks]);

  // Set audio source when track changes
  useEffect(() => {
    const currentTrack = audioTracks[currentTrackIndex];
    if (audioRef.current && currentTrack) {
      console.log('Setting audio source:', currentTrack.name, 'URL:', currentTrack.url);
      audioRef.current.src = currentTrack.url;
      audioRef.current.volume = 1.0;
      audioRef.current.load();
      console.log('Audio loaded, readyState:', audioRef.current.readyState);
    }
  }, [audioTracks, currentTrackIndex]);

  const handleAudioFilesChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
        return;
      }

      setError(null);

      try {
        const newTracks: AudioTrack[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file || !file.type.startsWith('audio/')) {
            continue;
          }

          const url = URL.createObjectURL(file);
          audioUrlsRef.current.push(url);

          // Get audio duration
          const audio = new Audio(url);
          await new Promise<void>((resolve, reject) => {
            audio.addEventListener('loadedmetadata', () => {
              if (!file) {
                reject(new Error('File is undefined'));
                return;
              }
              newTracks.push({
                id: `${Date.now()}-${i}`,
                file,
                name: file.name.replace(/\.[^/.]+$/, ''),
                url,
                duration: audio.duration,
              });
              resolve();
            });
            audio.addEventListener('error', () => {
              reject(new Error(`Falha ao carregar ${file?.name ?? 'arquivo'}`));
            });
          });
        }

        setAudioTracks((prev) => [...prev, ...newTracks]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar arquivos de áudio',
        );
      }
    },
    [],
  );

  const handleVideoFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith('video/')) {
        return;
      }

      setError(null);

      try {
        // Revoke previous video URL
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
        }

        const url = URL.createObjectURL(file);

        // Get video duration
        const video = document.createElement('video');
        video.src = url;
        await new Promise<void>((resolve, reject) => {
          video.addEventListener('loadedmetadata', () => {
            setVideoFile(file);
            setVideoUrl(url);
            setVideoDuration(video.duration);
            resolve();
          });
          video.addEventListener('error', () => {
            reject(new Error('Falha ao carregar o vídeo'));
          });
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Erro ao carregar o vídeo',
        );
      }
    },
    [videoUrl],
  );

  const handlePlay = useCallback(async () => {
    if (!videoRef.current || !audioRef.current || audioTracks.length === 0) {
      console.error('Missing refs or tracks');
      return;
    }

    try {
      console.log('Starting playback...');
      console.log('Audio src:', audioRef.current.src);
      console.log('Audio readyState:', audioRef.current.readyState);

      audioRef.current.volume = 1.0;

      // Wait for audio to be loaded if needed
      if (audioRef.current.readyState < 2) {
        console.log('Waiting for audio to load...');
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Audio load timeout')), 5000);

          audioRef.current!.addEventListener('canplay', () => {
            clearTimeout(timeout);
            console.log('Audio ready to play');
            resolve();
          }, { once: true });

          audioRef.current!.addEventListener('error', () => {
            clearTimeout(timeout);
            reject(new Error('Audio load error'));
          }, { once: true });
        });
      }

      // Play video
      await videoRef.current.play();
      console.log('Video playing');

      // Play audio
      await audioRef.current.play();
      console.log('Audio playing');

      setIsPlaying(true);
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), 1000);
      setError(null);
    } catch (err) {
      console.error('Erro ao reproduzir:', err);
      setError(`Erro ao reproduzir mídia: ${err instanceof Error ? err.message : 'Desconhecido'}`);
    }
  }, [audioTracks.length]);

  const handlePause = useCallback(() => {
    if (!videoRef.current || !audioRef.current) {
      return;
    }

    videoRef.current.pause();
    audioRef.current.pause();
    setIsPlaying(false);
  }, []);

  const handleReset = useCallback(() => {
    if (!videoRef.current || !audioRef.current) {
      return;
    }

    videoRef.current.pause();
    audioRef.current.pause();
    videoRef.current.currentTime = 0;
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setCurrentTrackIndex(0);
  }, []);

  const removeAudioTrack = useCallback((id: string) => {
    setAudioTracks((prev) => {
      const track = prev.find((t) => t.id === id);
      if (track) {
        URL.revokeObjectURL(track.url);
      }
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const handleAudioEnded = useCallback(() => {
    const nextIndex = currentTrackIndex + 1;
    if (nextIndex < audioTracks.length) {
      const nextTrack = audioTracks[nextIndex];
      if (!nextTrack) {
        return;
      }

      setCurrentTrackIndex(nextIndex);
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), 1000);

      // Wait for useEffect to set the new source, then play
      setTimeout(() => {
        if (audioRef.current && isPlaying) {
          audioRef.current.play().catch((err) => {
            console.error('Erro ao trocar música:', err);
            setError('Erro ao trocar de música');
          });
        }
      }, 100);
    } else {
      // End of playlist
      handlePause();
    }
  }, [audioTracks, currentTrackIndex, handlePause]);

  const handleVideoEnded = useCallback(() => {
    // Loop video
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      if (isPlaying) {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  // Calculate total duration and accumulated time
  const totalDuration = audioTracks.reduce(
    (sum, track) => sum + track.duration,
    0,
  );

  // Calculate accumulated time for current playback position
  const accumulatedTime = audioTracks
    .slice(0, currentTrackIndex)
    .reduce((sum, track) => sum + track.duration, 0) + currentTime;

  // Handle seek on progress bar
  const handleSeek = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current || audioTracks.length === 0) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const percentage = clickX / rect.width;
      const targetTime = percentage * totalDuration;

      // Find which track and position
      let accumulatedDuration = 0;
      let targetTrackIndex = 0;
      let targetTrackTime = 0;

      for (let i = 0; i < audioTracks.length; i++) {
        const track = audioTracks[i];
        if (!track) continue;

        if (accumulatedDuration + track.duration >= targetTime) {
          targetTrackIndex = i;
          targetTrackTime = targetTime - accumulatedDuration;
          break;
        }
        accumulatedDuration += track.duration;
      }

      const targetTrack = audioTracks[targetTrackIndex];
      if (!targetTrack) return;

      // Update track if needed
      if (targetTrackIndex !== currentTrackIndex) {
        setCurrentTrackIndex(targetTrackIndex);
        setIsTransitioning(true);
        setTimeout(() => setIsTransitioning(false), 1000);

        // Wait for useEffect to set the new source
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.currentTime = targetTrackTime;
            setCurrentTime(targetTrackTime);

            if (isPlaying) {
              audioRef.current.play().catch((err) => {
                console.error('Erro ao retomar reprodução:', err);
                setError('Erro ao navegar no áudio');
              });
            }
          }
        }, 100);
      } else {
        // Same track, just seek
        audioRef.current.currentTime = targetTrackTime;
        setCurrentTime(targetTrackTime);

        if (isPlaying) {
          audioRef.current.play().catch((err) => {
            console.error('Erro ao retomar reprodução:', err);
            setError('Erro ao navegar no áudio');
          });
        }
      }
    },
    [audioTracks, currentTrackIndex, isPlaying, totalDuration],
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate FFmpeg command for rendering
  const generateFFmpegCommand = useCallback(() => {
    if (!videoFile || audioTracks.length === 0 || trackTimestamps.length === 0) {
      return '';
    }

    const videoInput = `video.mp4`; // placeholder
    const audioInputs = audioTracks.map((_, i) => `audio${i}.mp3`).join(' ');

    // Build drawtext filters for each track
    const drawtextFilters = trackTimestamps.map((timestamp) => {
      const trackName = timestamp.trackName.replace(/'/g, "\\'");
      const startTime = timestamp.startTime;
      const endTime = timestamp.endTime;

      return `drawtext=text='TOCANDO AGORA\\n${trackName}':` +
        `fontfile=/System/Library/Fonts/Helvetica.ttc:fontsize=20:fontcolor=white:` +
        `box=1:boxcolor=black@0.8:boxborderw=10:` +
        `x=W-tw-20:y=H-th-20:` +
        `enable='between(t,${startTime.toFixed(2)},${endTime.toFixed(2)})'`;
    }).join(',');

    // Concatenate audio files
    const audioConcat = audioTracks.map((_, i) => `[${i}:a]`).join('');
    const audioConcatFilter = `${audioConcat}concat=n=${audioTracks.length}:v=0:a=1[aout]`;

    return `# Comando FFmpeg para renderizar o vídeo LoFi

# 1. Concatenar áudios
ffmpeg ${audioTracks.map((_, i) => `-i audio${i}.mp3`).join(' ')} \\
  -filter_complex "${audioConcatFilter}" \\
  -map "[aout]" concatenated_audio.mp3

# 2. Adicionar vídeo loop e labels
ffmpeg -stream_loop -1 -i ${videoInput} \\
  -i concatenated_audio.mp3 \\
  -filter_complex "[0:v]${drawtextFilters}[vout]" \\
  -map "[vout]" -map 1:a \\
  -c:v libx264 -preset medium -crf 23 \\
  -c:a aac -b:a 192k \\
  -shortest \\
  output.mp4`;
  }, [videoFile, audioTracks, trackTimestamps]);

  const canPreview = audioTracks.length > 0 && videoFile;

  return (
    <LabPageLayout
      title="LoFi Video Generator"
      description="Monte vídeos lofi com múltiplas músicas e vídeo loop de fundo. Adicione os arquivos de áudio e o vídeo de loop para visualizar o preview."
      maxWidthClassName="max-w-6xl"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Audio uploads */}
        <LabCard
          title={
            <div className="flex items-center gap-2">
              <Music className="h-5 w-5 text-primary-400" />
              <span>Músicas</span>
            </div>
          }
          actions={
            <div>
              <input
                id="audio-files-input"
                type="file"
                accept="audio/*"
                multiple
                onChange={handleAudioFilesChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  document.getElementById('audio-files-input')?.click()
                }
              >
                Adicionar
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            {audioTracks.length === 0 ? (
              <p className="text-sm text-white/60">
                Nenhuma música adicionada ainda
              </p>
            ) : (
              <>
                <p className="text-xs text-white/50">
                  {audioTracks.length} música{audioTracks.length !== 1 ? 's' : ''}{' '}
                  • Duração total: {formatTime(totalDuration)}
                </p>
                <div className="space-y-2">
                  {audioTracks.map((track, index) => (
                    <div
                      key={track.id}
                      className={`flex items-center justify-between rounded-lg border p-3 ${
                        currentTrackIndex === index && isPlaying
                          ? 'border-primary-400/60 bg-primary-500/10'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">
                          {index + 1}. {track.name}
                        </p>
                        <p className="text-xs text-white/50">
                          {formatTime(track.duration)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAudioTrack(track.id)}
                        className="text-xs text-white/50 hover:text-danger-400"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </LabCard>

        {/* Video upload */}
        <LabCard
          title={
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-accent-400" />
              <span>Vídeo Loop</span>
            </div>
          }
          actions={
            <div>
              <input
                id="video-file-input"
                type="file"
                accept="video/*"
                onChange={handleVideoFileChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  document.getElementById('video-file-input')?.click()
                }
              >
                {videoFile ? 'Alterar' : 'Adicionar'}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            {!videoFile ? (
              <p className="text-sm text-white/60">
                Nenhum vídeo adicionado ainda
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">
                  {videoFile.name}
                </p>
                <p className="text-xs text-white/50">
                  Duração: {formatTime(videoDuration)}
                </p>
              </div>
            )}
          </div>
        </LabCard>
      </div>

      {error && <LabAlert variant="danger">{error}</LabAlert>}

      {/* Preview */}
      {canPreview && (
        <LabCard
          title="Preview"
          actions={
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={!isPlaying && currentTime === 0}
              >
                Reset
              </Button>
              <Button
                type="button"
                variant={isPlaying ? 'outline' : 'primary'}
                size="sm"
                onClick={isPlaying ? handlePause : handlePlay}
              >
                {isPlaying ? 'Pausar' : 'Play'}
              </Button>
            </div>
          }
        >
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            {/* Video */}
            <video
              ref={videoRef}
              src={videoUrl ?? undefined}
              className="h-full w-full object-cover"
              loop
              muted
              onEnded={handleVideoEnded}
            />

            {/* Audio element */}
            <audio
              ref={audioRef}
              onEnded={handleAudioEnded}
              onTimeUpdate={handleTimeUpdate}
              preload="auto"
              className="hidden"
            />

            {/* Track label overlay - FFmpeg compatible design */}
            {isPlaying && audioTracks[currentTrackIndex] && (
              <div
                className="absolute bottom-5 right-5 px-4 py-3 bg-black/80"
                style={{
                  fontFamily: 'Arial, sans-serif',
                  transition: isTransitioning ? 'opacity 0.3s' : 'none',
                  opacity: isTransitioning ? 0.5 : 1,
                }}
                data-ffmpeg-x="W-tw-20"
                data-ffmpeg-y="H-th-20"
                data-ffmpeg-fontsize="20"
                data-ffmpeg-fontcolor="white"
                data-ffmpeg-boxcolor="black@0.8"
              >
                <p
                  className="text-xs uppercase tracking-wide text-gray-400"
                  style={{ marginBottom: '2px', fontWeight: 'normal' }}
                >
                  TOCANDO AGORA
                </p>
                <p
                  className="text-base font-bold text-white"
                  style={{ fontWeight: 'bold' }}
                >
                  {audioTracks[currentTrackIndex].name}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {/* Progress bar */}
            <div
              className="group relative h-2 cursor-pointer rounded-full bg-white/10 hover:h-3 transition-all"
              onClick={handleSeek}
            >
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{
                  width: `${totalDuration > 0 ? (accumulatedTime / totalDuration) * 100 : 0}%`,
                }}
              />
              {/* Hover indicator */}
              <div className="absolute -top-1 left-0 right-0 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Time display */}
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>
                Música {currentTrackIndex + 1} de {audioTracks.length}
              </span>
              <span>
                {formatTime(accumulatedTime)} / {formatTime(totalDuration)}
              </span>
            </div>
          </div>
        </LabCard>
      )}

      {!canPreview && (
        <LabAlert>
          Adicione pelo menos uma música e um vídeo para visualizar o preview
        </LabAlert>
      )}

      {/* FFmpeg command generator */}
      {canPreview && (
        <LabCard
          title="Comando FFmpeg para Renderização"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const command = generateFFmpegCommand();
                navigator.clipboard.writeText(command);
                alert('Comando copiado para a área de transferência!');
              }}
            >
              Copiar Comando
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-white/70">
              O design do banner foi criado para ser reproduzível com FFmpeg usando apenas o filtro <code className="px-1 py-0.5 rounded bg-white/10">drawtext</code>.
              Use o comando abaixo para gerar o vídeo final com os banners de nome das músicas.
            </p>

            <div className="rounded-lg bg-dark-900 p-4">
              <pre className="text-xs text-white/90 overflow-x-auto whitespace-pre-wrap font-mono">
                {generateFFmpegCommand()}
              </pre>
            </div>

            <div className="space-y-2 text-xs text-white/60">
              <p><strong>Parâmetros do Banner:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Posição: Bottom-right (20px de margem)</li>
                <li>Fundo: Preto com 80% de opacidade</li>
                <li>Fonte: Arial 20px, cor branca</li>
                <li>Padding: 10px (via boxborderw)</li>
                <li>Visibilidade: Controlada por timestamps (enable)</li>
              </ul>
            </div>
          </div>
        </LabCard>
      )}
    </LabPageLayout>
  );
}
