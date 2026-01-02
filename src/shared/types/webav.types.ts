/**
 * Tipos customizados para integração com WebAV no EduScript AI.
 * WebAV usa unidades de tempo em microsegundos (1s = 1_000_000µs).
 */

import type { IClip, OffscreenSprite } from '@webav/av-cliper';

/** Microsegundos (1 segundo = 1_000_000) */
export type Microseconds = number;

/** Converte segundos para microsegundos */
export const toMicroseconds = (seconds: number): Microseconds =>
  Math.floor(seconds * 1_000_000);

/** Converte microsegundos para segundos */
export const toSeconds = (microseconds: Microseconds): number =>
  microseconds / 1_000_000;

export type WebAVImageAsset = {
  kind: 'image';
  url: string;
};

export type WebAVVideoAsset = {
  kind: 'video';
  url: string;
  file?: File | Blob;
  durationSeconds?: number;
};

export type WebAVVisualAsset = WebAVImageAsset | WebAVVideoAsset;

export type WebAVVideoPlayback = {
  videoDuration: Microseconds;
  freezeFrameFor?: Microseconds;
};

/** Configuração de um slide para renderização com WebAV */
export interface WebAVSlideConfig {
  /** ID único do slide */
  id: string;
  /** URL da imagem do slide (blob ou data URL) */
  imageUrl?: string | null;
  /** URL do áudio do slide (blob ou data URL) */
  audioUrl?: string | null;
  /** Duração do slide em microsegundos */
  duration: Microseconds;
  /** Offset temporal em microsegundos (posição na timeline) */
  offset: Microseconds;
  /** Índice de z-order (maior = frente) */
  zIndex?: number;
  /** Asset visual associado (imagem ou vídeo) */
  visualAsset?: WebAVVisualAsset;
  /** Instruções de playback para vídeos customizados */
  videoPlayback?: WebAVVideoPlayback;
}

/** Entrada genérica usada pelo componente WebAVRenderer */
export interface WebAVRendererSlideInput {
  /** ID do slide */
  id: string;
  /** Ordem opcional para controlar a timeline */
  order?: number;
  /** URL da imagem (blob/data/http) */
  imageUrl?: string | null;
  /** Blob de áudio capturado no fluxo principal */
  audioBlob?: Blob | null;
  /** URL já existente para áudio (bundle importado) */
  audioUrl?: string | null;
  /** Duração conhecida do slide em segundos */
  durationSeconds?: number;
  /** Duração fallback em segundos (default 3s) */
  fallbackDurationSeconds?: number;
  /** Profundidade opcional no canvas */
  zIndex?: number;
  /** Asset visual associado (imagem ou vídeo) */
  visualAsset?: WebAVVisualAsset;
}

/** Configuração de renderização do vídeo final */
export interface WebAVRenderConfig {
  /** Largura do vídeo em pixels */
  width: number;
  /** Altura do vídeo em pixels */
  height: number;
  /** Frame rate (default: 30) */
  frameRate?: number;
  /** Bitrate do vídeo em bps (default: 5_000_000) */
  videoBitrate?: number;
  /** Bitrate do áudio em bps (default: 128_000) */
  audioBitrate?: number;
}

/** Metadados do clip após inicialização */
export interface ClipMetadata {
  /** Duração total em microsegundos */
  duration: Microseconds;
  /** Largura em pixels (vídeo/imagem) */
  width: number;
  /** Altura em pixels (vídeo/imagem) */
  height: number;
  /** Possui trilha de áudio */
  hasAudio: boolean;
  /** Possui trilha de vídeo */
  hasVideo: boolean;
}

/** Estado de progresso da renderização */
export interface RenderProgress {
  /** Progresso de 0 a 1 */
  progress: number;
  /** Frame atual sendo processado */
  currentFrame?: number;
  /** Total de frames */
  totalFrames?: number;
  /** Tempo estimado restante em segundos */
  estimatedTimeRemaining?: number;
  /** Status textual */
  status: string;
}

/** Resultado da renderização */
export interface RenderResult {
  /** Stream do MP4 final */
  stream: ReadableStream<Uint8Array>;
  /** Duração total em microsegundos */
  duration: Microseconds;
  /** Tamanho estimado em bytes (se conhecido) */
  size?: number;
  /** URL blob para preview/download */
  blobUrl?: string;
}

/** Opções para animações de transição */
export interface TransitionAnimation {
  /** Tipo de transição */
  type: 'fade' | 'slide' | 'zoom' | 'none';
  /** Duração da transição em microsegundos */
  duration: Microseconds;
  /** Easing function */
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/** Sprite enriquecido com metadados do slide */
export interface EnrichedSprite {
  sprite: OffscreenSprite;
  clip: IClip;
  slideId: string;
  metadata: ClipMetadata;
}

/** Capabilities do navegador para WebCodecs */
export interface WebCodecsCapabilities {
  /** WebCodecs disponível */
  supported: boolean;
  /** VideoEncoder disponível */
  hasVideoEncoder: boolean;
  /** VideoDecoder disponível */
  hasVideoDecoder: boolean;
  /** AudioEncoder disponível */
  hasAudioEncoder: boolean;
  /** AudioDecoder disponível */
  hasAudioDecoder: boolean;
  /** SharedArrayBuffer disponível (requer CORS headers) */
  hasSharedArrayBuffer: boolean;
  /** Navegador recomendado */
  browserName?: string;
  /** Versão do navegador */
  browserVersion?: string;
}

/** Erro customizado para WebAV */
export class WebAVError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_SUPPORTED'
      | 'ENCODING_ERROR'
      | 'DECODING_ERROR'
      | 'CLIP_ERROR'
      | 'COMBINATOR_ERROR'
      | 'RENDER_ERROR'
      | 'UNKNOWN',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'WebAVError';
  }
}
