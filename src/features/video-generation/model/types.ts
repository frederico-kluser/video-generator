import type {
  AspectRatio,
  VideoGenerationStep,
} from '@/config/constants/video';
import type { PromptBlueprintId } from '@/content/prompts';

export type Slide = {
  id: string;
  order: number;
  scriptText: string;
  visualPrompt: string;
  imageUrl?: string;
  userNotes?: string;
  audioBlob?: Blob;
  isRegeneratingImage: boolean;
};

export type ProjectData = {
  topic: string;
  materials: string;
  aspectRatio: AspectRatio;
  targetAudience: string;
  promptId: PromptBlueprintId;
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
  promptId: PromptBlueprintId;
};
