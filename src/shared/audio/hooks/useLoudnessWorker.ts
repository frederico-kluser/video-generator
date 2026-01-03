import { useCallback, useEffect, useRef } from 'react';

export type LoudnessMetrics = {
  integratedLufs: number;
  blockValues: { time: number; value: number }[];
  truePeakDb: number;
  noiseFloorDb: number;
  loudnessRange: number;
};

type PendingRequest = {
  resolve: (value: LoudnessMetrics) => void;
  reject: (reason?: unknown) => void;
};

type WorkerMessage =
  | { id: number; type: 'measure:result'; payload: LoudnessMetrics }
  | { id: number; type: 'measure:error'; payload: unknown };

export function useLoudnessWorker() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<Map<number, PendingRequest>>(new Map());

  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pending.clear();
    };
  }, []);

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/loudnessWorker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (!message || typeof message.id !== 'number') {
          return;
        }
        const pending = pendingRef.current.get(message.id);
        if (!pending) {
          return;
        }
        pendingRef.current.delete(message.id);
        if (message.type === 'measure:result') {
          pending.resolve(message.payload);
        } else {
          const reason = message.payload;
          const error =
            reason instanceof Error
              ? reason
              : new Error(
                  typeof reason === 'string' ? reason : 'Worker error',
                );
          pending.reject(error);
        }
      };
    }
    return workerRef.current;
  }, []);

  const measureBuffer = useCallback(
    (buffer: AudioBuffer) => {
      const worker = ensureWorker();
      if (!worker) {
        return Promise.reject(new Error('Worker não disponível.'));
      }

      const id = requestIdRef.current++;
      const payloadChannels: ArrayBuffer[] = [];
      const transferables: ArrayBuffer[] = [];
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const copy = buffer.getChannelData(channel).slice();
        payloadChannels.push(copy.buffer);
        transferables.push(copy.buffer);
      }

      const message = {
        id,
        type: 'measure' as const,
        payload: {
          channels: payloadChannels,
          sampleRate: buffer.sampleRate,
        },
      };

      return new Promise<LoudnessMetrics>((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject });
        worker.postMessage(message, transferables);
      });
    },
    [ensureWorker],
  );

  return { measureBuffer };
}
