import type {
  AspectRatio,
  VideoGenerationStep,
} from '@/config/constants/video';

export type SlideStyleReference = {
  id: string;
  name: string;
  previewUrl: string;
  file?: File;
};

export type SlideStyleGuide = {
  notes: string;
  inputFidelity: 'high' | 'low';
  references: SlideStyleReference[];
};

export const createDefaultStyleGuide = (): SlideStyleGuide => ({
  notes: '',
  inputFidelity: 'high',
  references: [],
});

export type SlideCustomAsset = {
  id: string;
  type: 'image' | 'video';
  name: string;
  previewUrl: string;
  sourceUrl: string;
  file?: File;
  durationMs?: number;
};

export type SlideVisualSource =
  | 'manual-upload'
  | 'image-generation'
  | 'math-video';

export type Slide = {
  id: string;
  order: number;
  scriptText: string;
  narrationText: string;
  visualPrompt: string;
  mathAnimationPrompt?: string;
  visualSource: SlideVisualSource;
  imageUrl?: string;
  userNotes?: string;
  audioBlob?: Blob;
  isRegeneratingImage: boolean;
  styleGuide: SlideStyleGuide;
  customAsset?: SlideCustomAsset | null;
};

export type SlideContentPatch = {
  scriptText: string;
  narrationText: string;
  visualPrompt: string;
};

export type SlideEditOperation = {
  action: 'insert' | 'update' | 'delete';
  targetIndex: number;
  slideId?: string;
  slide?: SlideContentPatch;
  reason?: string;
};

export type ProjectData = {
  topic: string;
  materials: string;
  aspectRatio: AspectRatio;
  targetAudience: string;
  isMathProject: boolean;
};

export type GenerationProgress = {
  total: number;
  completed: number;
  currentAction: string;
};

export type VideoGenerationState = {
  step: VideoGenerationStep;
  slides: Slide[];
  projectData: Partial<ProjectData>;
  progress: GenerationProgress;
};

export type VideoGenerationPayload = {
  topic: string;
  materials: string;
  aspectRatio: AspectRatio;
  targetAudience: string;
};
