import type { AspectRatio } from '@/config/constants/video';

const FALLBACK_BASE_URL = 'http://localhost:8000';

const resolveBaseUrl = (): string => {
  const viteEnv = import.meta.env?.VITE_MANIM_API_BASE_URL;
  if (viteEnv) {
    return viteEnv;
  }

  if (typeof process !== 'undefined' && process.env?.VITE_MANIM_API_BASE_URL) {
    return process.env.VITE_MANIM_API_BASE_URL;
  }

  return FALLBACK_BASE_URL;
};

export const MANIM_API_BASE_URL = resolveBaseUrl();

export const MANIM_RESOLUTION_BY_ASPECT_RATIO: Record<
  AspectRatio,
  { width: number; height: number }
> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};

