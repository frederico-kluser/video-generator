import { useCallback, useMemo, useRef, useState } from 'react';

const SUPPORTED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export type RecorderStatus = 'idle' | 'recording' | 'error';

export function useVoiceRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);
  const rejectStopRef = useRef<((reason?: unknown) => void) | null>(null);

  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const getMimeType = useCallback(() => {
    return SUPPORTED_MIME_TYPES.find((type) =>
      typeof window !== 'undefined' && window.MediaRecorder
        ? MediaRecorder.isTypeSupported(type)
        : false,
    );
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const resetRecorder = useCallback(() => {
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    resolveStopRef.current = null;
    rejectStopRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (status === 'recording') {
      return;
    }

    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microfone não disponível neste dispositivo.');
      setStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      const mimeType = getMimeType() ?? 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        resolveStopRef.current?.(blob);
        cleanupStream();
        resetRecorder();
        setStatus('idle');
      };

      recorder.onerror = (event) => {
        rejectStopRef.current?.(event.error ?? new Error('Falha na gravação.'));
        cleanupStream();
        resetRecorder();
        setStatus('error');
        setError('Ocorreu um problema durante a gravação.');
      };

      recorder.start();
      setStatus('recording');
    } catch (err) {
      const message =
        err instanceof DOMException ? err.message : 'Não foi possível iniciar a gravação.';
      setError(message);
      setStatus('error');
      cleanupStream();
      resetRecorder();
    }
  }, [cleanupStream, getMimeType, resetRecorder, status]);

  const stopRecording = useCallback(async () => {
    if (status !== 'recording' || !mediaRecorderRef.current) {
      return null;
    }

    return await new Promise<Blob | null>((resolve, reject) => {
      resolveStopRef.current = resolve;
      rejectStopRef.current = reject;
      mediaRecorderRef.current?.stop();
    }).finally(() => {
      cleanupStream();
    });
  }, [cleanupStream, status]);

  const isRecording = useMemo(() => status === 'recording', [status]);

  return {
    isRecording,
    status,
    error,
    startRecording,
    stopRecording,
  };
}
