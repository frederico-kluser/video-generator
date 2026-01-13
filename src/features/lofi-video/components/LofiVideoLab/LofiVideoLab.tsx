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

  // Set initial audio source when tracks are available
  useEffect(() => {
    const firstTrack = audioTracks[0];
    if (audioRef.current && firstTrack && currentTrackIndex === 0 && !isPlaying) {
      audioRef.current.src = firstTrack.url;
      audioRef.current.volume = 1.0; // Ensure volume is at maximum
    }
  }, [audioTracks, currentTrackIndex, isPlaying]);

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

  const handlePlay = useCallback(() => {
    if (!videoRef.current || !audioRef.current || audioTracks.length === 0) {
      return;
    }

    audioRef.current.volume = 1.0;
    videoRef.current.play();
    audioRef.current.play();
    setIsPlaying(true);
    setIsTransitioning(true);
    setTimeout(() => setIsTransitioning(false), 1000);
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

      if (audioRef.current) {
        audioRef.current.src = nextTrack.url;
        audioRef.current.volume = 1.0;
        audioRef.current.play();
      }
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
        audioRef.current.src = targetTrack.url;
        audioRef.current.volume = 1.0;
      }

      // Set time and play if needed
      audioRef.current.currentTime = targetTrackTime;
      setCurrentTime(targetTrackTime);

      if (isPlaying) {
        audioRef.current.play();
      }
    },
    [audioTracks, currentTrackIndex, isPlaying, totalDuration],
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
              src={audioTracks[currentTrackIndex]?.url}
              onEnded={handleAudioEnded}
              onTimeUpdate={handleTimeUpdate}
              preload="metadata"
              className="hidden"
            />

            {/* Track label overlay */}
            {isPlaying && audioTracks[currentTrackIndex] && (
              <div
                className={`absolute bottom-4 right-4 rounded-lg border border-white/20 bg-black/70 px-4 py-2 backdrop-blur-sm transition-all duration-300 ${
                  isTransitioning
                    ? 'animate-fade-in scale-110'
                    : 'scale-100'
                }`}
              >
                <p className="text-xs uppercase tracking-wider text-white/60">
                  Tocando agora
                </p>
                <p className="text-sm font-medium text-white">
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
    </LabPageLayout>
  );
}
