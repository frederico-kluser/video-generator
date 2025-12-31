export enum AppStep {
  INPUT = 'INPUT',
  GENERATING_SCRIPT = 'GENERATING_SCRIPT',
  GENERATING_SLIDES = 'GENERATING_SLIDES',
  EDITOR = 'EDITOR',
  RECORDING = 'RECORDING',
  PREVIEW = 'PREVIEW'
}

export enum AspectRatio {
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16',
  SQUARE = '1:1'
}

export interface Slide {
  id: string;
  order: number;
  scriptText: string;
  visualPrompt: string; // The prompt used to generate the image
  imageUrl?: string; // Base64 or Blob URL
  userNotes?: string; // Feedback from user
  audioBlob?: Blob; // Recorded audio
  isRegeneratingImage: boolean;
}

export interface ProjectData {
  topic: string;
  materials: string; // User input text/materials
  aspectRatio: AspectRatio;
  targetAudience: string;
  slides: Slide[];
}

export interface GenerationProgress {
  total: number;
  completed: number;
  currentAction: string;
}