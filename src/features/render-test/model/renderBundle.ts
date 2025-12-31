import type { AspectRatio } from '@/config/constants/video';

export type RenderBundleSlide = {
  id: string;
  order: number;
  scriptText: string;
  narrationText: string;
  visualPrompt: string;
  imageFile: string | null;
  audioFile: string | null;
};

export type RenderBundleManifest = {
  schemaVersion: 1;
  exportedAt: string;
  aspectRatio: AspectRatio;
  project: {
    topic?: string;
    materials?: string;
    targetAudience?: string;
    promptId?: string;
  };
  slides: RenderBundleSlide[];
};
