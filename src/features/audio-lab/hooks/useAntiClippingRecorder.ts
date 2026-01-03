import { useCallback, useEffect, useRef, useState } from 'react';

import { getPreferredMimeType } from '@/features/audio-lab/lib/mediaUtils';

export type AntiClippingRecorderStatus = 'idle' | 'recording' | 'error';

const SAMPLE_RATE = 48_000;
const INPUT_HEADROOM = 0.8;
const OUTPUT_HEADROOM = 0.95;
const MIME_FALLBACKS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

type WebAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type UseAntiClippingRecorderReturn = {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  isRecording: boolean;
  status: AntiClippingRecorderStatus;
  error: string | null;
  level: number;
  isClipping: boolean;
  gainReduction: number;
};

export function useAntiClippingRecorder(): UseAntiClippingRecorderReturn {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const dataBufferRef = useRef<Float32Array | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);
  const rejectStopRef = useRef<((reason?: unknown) => void) | null>(null);

  const [status, setStatus] = useState<AntiClippingRecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [isClipping, setIsClipping] = useState(false);
  const [gainReduction, setGainReduction] = useState(0);

  const pickMimeType = useCallback(() => {
    const preferred = getPreferredMimeType();
    if (preferred) {
      return preferred;
    }

    return MIME_FALLBACKS.find((candidate) =>
      typeof window !== 'undefined' && window.MediaRecorder
        ? MediaRecorder.isTypeSupported(candidate)
        : false,
    );
  }, []);

  const stopLevelMonitor = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    dataBufferRef.current = null;
    setLevel(0);
    setIsClipping(false);
    setGainReduction(0);
  }, []);

  const cleanupResources = useCallback(() => {
    stopLevelMonitor();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    analyserRef.current?.disconnect();
    analyserRef.current = null;

    compressorRef.current?.disconnect();
    compressorRef.current = null;

    destinationRef.current?.disconnect();
    destinationRef.current = null;

    const context = audioContextRef.current;
    if (context) {
      context.close().catch(() => undefined);
    }
    audioContextRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    resolveStopRef.current = null;
    rejectStopRef.current = null;
  }, [stopLevelMonitor]);

  const startLevelMonitor = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }

    dataBufferRef.current = new Float32Array(analyser.fftSize);

    const update = () => {
      if (!analyserRef.current || !dataBufferRef.current) {
        return;
      }

      analyserRef.current.getFloatTimeDomainData(dataBufferRef.current);
      let peak = 0;
      for (let i = 0; i < dataBufferRef.current.length; i += 1) {
        const abs = Math.abs(dataBufferRef.current[i]);
        if (abs > peak) {
          peak = abs;
        }
      }
      setLevel(peak);
      setIsClipping(peak >= 0.99);

      if (compressorRef.current) {
        const reduction = compressorRef.current.reduction;
        setGainReduction(Number.isFinite(reduction) ? reduction : 0);
      }

      rafIdRef.current = requestAnimationFrame(update);
    };

    rafIdRef.current = requestAnimationFrame(update);
  }, []);

  const createAudioContext = useCallback(() => {
    if (typeof window === 'undefined') {
      throw new Error('AudioContext indisponível fora do browser.');
    }

    const AudioContextCtor =
      window.AudioContext || (window as WebAudioWindow).webkitAudioContext;

    if (!AudioContextCtor) {
      throw new Error('Este navegador não suporta Web Audio API.');
    }

    return new AudioContextCtor({
      sampleRate: SAMPLE_RATE,
      latencyHint: 'interactive',
    });
  }, []);

  const startRecording = useCallback(async () => {
    if (status === 'recording') {
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microfone não disponível neste dispositivo.');
      setStatus('error');
      return;
    }

    try {
      setError(null);
      setLevel(0);
      setIsClipping(false);
      setGainReduction(0);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: SAMPLE_RATE },
        },
      });

      const context = createAudioContext();
      if (context.state === 'suspended') {
        await context.resume();
      }

      audioContextRef.current = context;
      streamRef.current = stream;

      const source = context.createMediaStreamSource(stream);
      const inputGain = context.createGain();
      inputGain.gain.value = INPUT_HEADROOM;

      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-6, context.currentTime);
      compressor.knee.setValueAtTime(3, context.currentTime);
      compressor.ratio.setValueAtTime(20, context.currentTime);
      compressor.attack.setValueAtTime(0.001, context.currentTime);
      compressor.release.setValueAtTime(0.1, context.currentTime);
      compressorRef.current = compressor;

      const outputGain = context.createGain();
      outputGain.gain.value = OUTPUT_HEADROOM;

      const destination = context.createMediaStreamDestination();
      destinationRef.current = destination;

      source.connect(inputGain);
      inputGain.connect(analyser);
      analyser.connect(compressor);
      compressor.connect(outputGain);
      outputGain.connect(destination);

      const mimeType = pickMimeType() ?? 'audio/webm';
      const recorder = new MediaRecorder(destination.stream, {
        mimeType,
        audioBitsPerSecond: 128_000,
      });

      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        resolveStopRef.current?.(blob);
        cleanupResources();
        setStatus('idle');
      };

      recorder.onerror = (event) => {
        rejectStopRef.current?.(event.error ?? new Error('Falha na gravação.'));
        setError('Ocorreu um problema durante a gravação.');
        setStatus('error');
        cleanupResources();
      };

      recorder.start(250);
      setStatus('recording');
      startLevelMonitor();
    } catch (err) {
      const message =
        err instanceof DOMException
          ? err.message
          : 'Não foi possível iniciar a gravação profissional.';
      setError(message);
      setStatus('error');
      cleanupResources();
    }
  }, [cleanupResources, createAudioContext, pickMimeType, startLevelMonitor, status]);

  const stopRecording = useCallback(async () => {
    if (status !== 'recording' || !mediaRecorderRef.current) {
      return null;
    }

    return await new Promise<Blob | null>((resolve, reject) => {
      resolveStopRef.current = resolve;
      rejectStopRef.current = reject;
      try {
        mediaRecorderRef.current?.stop();
      } catch (err) {
        reject(err);
      }
    }).finally(() => {
      stopLevelMonitor();
    });
  }, [status, stopLevelMonitor]);

  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  return {
    startRecording,
    stopRecording,
    isRecording: status === 'recording',
    status,
    error,
    level,
    isClipping,
    gainReduction,
  };
}
