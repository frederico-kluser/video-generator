import type { AspectRatio } from './video';

export type SafeZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const IMAGE_SIZE_BY_ASPECT_RATIO: Record<
  AspectRatio,
  {
    apiSize: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
    width: number;
    height: number;
    cropTo: { width: number; height: number };
    safeZone: SafeZone;
  }
> = {
  '16:9': {
    apiSize: '1536x1024',
    width: 1536,
    height: 1024,
    cropTo: { width: 1920, height: 1080 },
    safeZone: { x: 0.15, y: 0.1, width: 0.7, height: 0.8 },
  },
  '9:16': {
    apiSize: '1024x1536',
    width: 1024,
    height: 1536,
    cropTo: { width: 1080, height: 1920 },
    safeZone: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 },
  },
  '1:1': {
    apiSize: '1024x1024',
    width: 1024,
    height: 1024,
    cropTo: { width: 1080, height: 1080 },
    safeZone: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  },
} as const;

export type ImageAspectRatio = keyof typeof IMAGE_SIZE_BY_ASPECT_RATIO;

export type ImageSizeConfig =
  (typeof IMAGE_SIZE_BY_ASPECT_RATIO)[ImageAspectRatio];
