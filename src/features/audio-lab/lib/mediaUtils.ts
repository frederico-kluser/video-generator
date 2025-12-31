import { useEffect, useMemo } from 'react';

import { appLogger } from '@/shared/logging/logger';

export const AUDIO_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
] as const;

export const getPreferredMimeType = (): string | null => {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  return (
    AUDIO_MIME_TYPES.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    ) ?? null
  );
};

export const getVoiceMediaConstraints = (): MediaTrackConstraints => ({
  channelCount: 1,
  sampleRate: 48_000,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
});

export type RecorderBundle = {
  recorder: MediaRecorder;
  completion: Promise<Blob>;
};

export function createRecorderBundle(
  stream: MediaStream,
  preferredMime: string | null,
): RecorderBundle {
  const options: MediaRecorderOptions = {
    audioBitsPerSecond: 128_000,
  };

  if (preferredMime) {
    options.mimeType = preferredMime;
  }

  const recorder = new MediaRecorder(stream, options);
  const completion = new Promise<Blob>((resolve, reject) => {
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      reject(
        event.error ?? new Error('MediaRecorder falhou durante a captura.'),
      );
    };

    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    };
  });

  recorder.start();
  return { recorder, completion };
}

export function safeStopRecorder(recorder: MediaRecorder | null) {
  if (!recorder) {
    return;
  }

  if (recorder.state !== 'inactive') {
    try {
      recorder.stop();
    } catch (error) {
      appLogger.warn('⚠️ Falha ao parar MediaRecorder.', { error });
    }
  }
}

export function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) {
      return undefined;
    }

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return url;
}
